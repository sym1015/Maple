/**
 * Frame loading for sprite export.
 *
 * Verified against gms/270 (npm run assets:inspect-animation):
 *  - Frame numbers past the last frame do NOT 404; the API wraps around
 *    (stand1: 0,1,2,0,1,2…; walk1: 0..3 then repeats; jump/sit/prone: 1 frame).
 *  - PNG bytes differ per request, so frames are compared by decoded pixels.
 *  - feetCenter/navelCenter/center renders put the anchor at (floor(w/2), floor(h/2));
 *    for feetCenter the lowest opaque row is always floor(h/2)+1 (feet).
 */
import { characterRenderPath, skinIdFor, equipmentItemIds } from "../characterRender";
import type { CharacterEquipment } from "../../types/character";

export type AnchorMode = "topLeft" | "center" | "feet" | "navel";

const VARIANT: Record<AnchorMode, string> = {
  topLeft: "",
  center: "center/",
  feet: "feetCenter/",
  navel: "navelCenter/",
};

export interface LoadedFrame {
  index: number;
  blob: Blob;
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Anchor point inside this frame image. */
  anchorX: number;
  anchorY: number;
  /** Pixel hash used to detect the wrap-around. */
  hash: string;
}

export interface FrameEvents {
  onRetry?: (frame: number, attempt: number, max: number, reason: string) => void;
  onFrame?: (frame: LoadedFrame) => void;
}

export function framePath(equipment: CharacterEquipment, action: string, frame: number, anchor: AnchorMode): string {
  if (anchor === "topLeft") return characterRenderPath(equipment, action, frame);
  const items = equipmentItemIds(equipment).join(",");
  return `render/character/${VARIANT[anchor]}${skinIdFor(equipment)}/${items}/${action}/${frame}.png`;
}

export function anchorPoint(width: number, height: number, anchor: AnchorMode) {
  return anchor === "topLeft" ? { x: 0, y: 0 } : { x: Math.floor(width / 2), y: Math.floor(height / 2) };
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    });
  });

export class FrameError extends Error {
  constructor(public frame: number, public reason: string) {
    super(reason);
  }
}

/** FNV-1a over the RGBA pixels plus the size. */
function pixelHash(data: Uint8ClampedArray, width: number, height: number): string {
  let h = 0x811c9dc5 ^ width ^ (height << 16);
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

let scratch: OffscreenCanvas | HTMLCanvasElement | null = null;
function readPixels(bitmap: ImageBitmap): Uint8ClampedArray {
  if (!scratch) scratch = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
  scratch.width = bitmap.width;
  scratch.height = bitmap.height;
  const ctx = scratch.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

/** Session cache of raw frames: characterHash/action/anchor/frame → frame. */
const frameCache = new Map<string, Promise<LoadedFrame>>();

export async function loadFrame(
  url: string,
  cacheKey: string,
  index: number,
  anchor: AnchorMode,
  { signal, retries = 3, events }: { signal?: AbortSignal; retries?: number; events?: FrameEvents } = {},
): Promise<LoadedFrame> {
  const cached = frameCache.get(cacheKey);
  if (cached) return cached;

  const task = (async () => {
    let lastReason = "";
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        events?.onRetry?.(index, attempt, retries, lastReason);
        await sleep(1000 * 2 ** (attempt - 1), signal);
      }
      try {
        const res = await fetch(url, { signal });
        if (!res.ok) {
          lastReason = `HTTP ${res.status}`;
          // 4xx other than 429 will not change on retry.
          if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
          continue;
        }
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        const { x, y } = anchorPoint(bitmap.width, bitmap.height, anchor);
        return {
          index,
          blob,
          bitmap,
          width: bitmap.width,
          height: bitmap.height,
          anchorX: x,
          anchorY: y,
          hash: pixelHash(readPixels(bitmap), bitmap.width, bitmap.height),
        };
      } catch (e) {
        if (signal?.aborted) throw e;
        lastReason = (e as Error).message || "네트워크 오류";
      }
    }
    throw new FrameError(index, lastReason);
  })();

  frameCache.set(cacheKey, task);
  task.catch(() => frameCache.delete(cacheKey));
  return task;
}

/**
 * Smallest period p such that every loaded hash repeats with period p, confirmed by
 * having seen at least one full repeat plus two more frames (p + max(p, 3) frames).
 * Returns null while undecided. Examples: [a,b,c,a,b,c] → 3, [a,a,b,a,a,b] → 3,
 * [a,a,a,a] → 1 (the first two frames being equal does not end the animation early).
 */
export function detectFrameCount(hashes: string[]): number | null {
  for (let p = 1; p <= hashes.length; p++) {
    if (hashes.length < p + Math.max(p, 3)) return null;
    if (hashes.every((h, i) => h === hashes[i % p])) return p;
  }
  return null;
}

/**
 * Load every distinct frame of an action. The API wraps frame numbers around instead
 * of failing, so frames are requested in windows of `concurrency` until
 * detectFrameCount() finds the repeat period.
 */
export async function loadAnimationFrames(
  equipment: CharacterEquipment,
  characterHash: string,
  action: string,
  anchor: AnchorMode,
  { signal, concurrency = 3, maxFrames = 32, events }: { signal?: AbortSignal; concurrency?: number; maxFrames?: number; events?: FrameEvents } = {},
): Promise<{ frames: LoadedFrame[]; capped: boolean }> {
  const get = (i: number) =>
    loadFrame(framePath(equipment, action, i, anchor), `${characterHash}/${action}/${anchor}/${i}`, i, anchor, { signal, events });

  const loaded: LoadedFrame[] = [];
  // Enough frames to confirm a period of maxFrames.
  const limit = maxFrames * 2;
  while (loaded.length < limit) {
    const start = loaded.length;
    const batch = await Promise.all(Array.from({ length: Math.min(concurrency, limit - start) }, (_, k) => get(start + k)));
    for (const frame of batch) {
      loaded[frame.index] = frame;
      events?.onFrame?.(frame);
    }
    const count = detectFrameCount(loaded.map((f) => f.hash));
    if (count !== null) return { frames: loaded.slice(0, count), capped: false };
  }
  return { frames: loaded.slice(0, maxFrames), capped: true };
}

/** Stable short hash of the character's look (skin + every equipped slot). */
export async function characterHash(equipment: CharacterEquipment): Promise<string> {
  const parts = [`skin:${skinIdFor(equipment)}`, ...Object.entries(equipment).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`)];
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(parts.join("|")));
  return [...new Uint8Array(digest)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}
