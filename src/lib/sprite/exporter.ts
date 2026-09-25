/**
 * Runs a sprite export: loads frames for each requested action (sequentially, frames in
 * windows of `concurrency`), builds a sheet per action and packs everything into a ZIP.
 * Only the actions passed in are requested; nothing is fetched automatically.
 */
import { zip } from "fflate";
import type { CharacterEquipment } from "../../types/character";
import { FrameError, characterHash, loadAnimationFrames, type LoadedFrame } from "./frames";
import { buildSheet, canvasToPng, type BuiltSheet, type SheetSettings } from "./sheet";

export interface FailedFrame {
  animation: string;
  frame: number;
  reason: string;
}

export interface AnimationProgress {
  animation: string;
  status: "waiting" | "loading" | "done" | "skipped";
  loadedFrames: number;
  /** Known once loading finished. */
  frameCount?: number;
  retry?: { frame: number; attempt: number; max: number };
  message?: string;
}

export interface AnimationResult {
  animation: string;
  frames: LoadedFrame[];
  sheet: BuiltSheet;
  /** Hit the safety limit before a repeat was seen. */
  capped: boolean;
}

export interface ExportResult {
  characterHash: string;
  results: AnimationResult[];
  failedFrames: FailedFrame[];
  skipped: { animation: string; reason: string }[];
}

export async function runExport(
  equipment: CharacterEquipment,
  animations: string[],
  settings: SheetSettings,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (p: AnimationProgress[]) => void },
): Promise<ExportResult> {
  const hash = await characterHash(equipment);
  const progress: AnimationProgress[] = animations.map((animation) => ({ animation, status: "waiting", loadedFrames: 0 }));
  const emit = () => onProgress(progress.map((p) => ({ ...p })));
  emit();

  const results: AnimationResult[] = [];
  const failedFrames: FailedFrame[] = [];
  const skipped: ExportResult["skipped"] = [];

  for (const [i, animation] of animations.entries()) {
    signal.throwIfAborted();
    const p = progress[i];
    p.status = "loading";
    emit();
    try {
      const { frames, capped } = await loadAnimationFrames(equipment, hash, animation, settings.anchor, {
        signal,
        events: {
          onFrame: () => {
            p.loadedFrames++;
            p.retry = undefined;
            emit();
          },
          onRetry: (frame, attempt, max) => {
            p.retry = { frame, attempt, max };
            emit();
          },
        },
      });
      const sheet = buildSheet(frames, settings, { animation, characterHash: hash, equipment });
      results.push({ animation, frames, sheet, capped });
      p.status = "done";
      p.frameCount = frames.length;
      p.loadedFrames = frames.length;
      p.retry = undefined;
      if (capped) p.message = `프레임이 ${frames.length}장을 넘어 앞의 ${frames.length}장만 사용했습니다.`;
    } catch (e) {
      if (signal.aborted) throw e;
      // Unsupported or failing actions are skipped, not fatal.
      const reason = e instanceof FrameError ? e.reason : (e as Error).message;
      if (e instanceof FrameError) failedFrames.push({ animation, frame: e.frame, reason });
      skipped.push({ animation, reason });
      p.status = "skipped";
      p.retry = undefined;
      p.message = `건너뜀: ${reason}`;
    }
    emit();
  }
  return { characterHash: hash, results, failedFrames, skipped };
}

export function exportManifest(result: ExportResult, settings: SheetSettings, equipment: CharacterEquipment) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    characterHash: result.characterHash,
    character: { equipment },
    settings,
    animations: result.results.map((r) => ({
      id: r.animation,
      frameCount: r.frames.length,
      spritesheet: `${r.animation}/spritesheet.png`,
      metadata: `${r.animation}/${r.animation}.json`,
    })),
    skipped: result.skipped,
    failedFrames: result.failedFrames,
  };
}

async function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasToPng(canvas)).arrayBuffer());
}

/** CharacterSpriteSheet/{manifest.json, <action>/{0..n}.png, spritesheet.png, <action>.json} */
export async function buildZip(result: ExportResult, settings: SheetSettings, equipment: CharacterEquipment, signal?: AbortSignal): Promise<Blob> {
  const root = "CharacterSpriteSheet";
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    [`${root}/manifest.json`]: enc.encode(JSON.stringify(exportManifest(result, settings, equipment), null, 2)),
  };
  for (const r of result.results) {
    signal?.throwIfAborted();
    const dir = `${root}/${r.animation}`;
    for (const [i, frameCanvas] of r.sheet.frameCanvases.entries()) files[`${dir}/${i}.png`] = await pngBytes(frameCanvas);
    files[`${dir}/spritesheet.png`] = await pngBytes(r.sheet.canvas);
    files[`${dir}/${r.animation}.json`] = enc.encode(JSON.stringify(r.sheet.metadata, null, 2));
  }
  signal?.throwIfAborted();
  // PNGs are already compressed; store them to keep zipping fast.
  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(
      Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: k.endsWith(".png") ? 0 : 6 }]])),
      (err, out) => (err ? reject(err) : resolve(out)),
    ),
  );
  signal?.throwIfAborted();
  return new Blob([data as BlobPart], { type: "application/zip" });
}
