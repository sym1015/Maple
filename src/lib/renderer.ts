/**
 * Canvas compositor.
 *
 * The renderer knows nothing about MapleStory rules: it receives already-positioned
 * layers (image + top-left position + sort key) and draws them in order. Building those
 * layers from item sprite data (anchors, z order) lives in lib/characterLayers.ts, so the
 * layer order can be changed without touching drawing code.
 */

export interface RenderLayer {
  /** Stable key, e.g. "12000:head" (item id + part name). */
  key: string;
  /** Image URL (data URI or relative path). */
  src: string;
  /** Top-left position in character space (origin = character feet/navel anchor). */
  x: number;
  y: number;
  /** Lower draws first. */
  order: number;
}

export interface RenderOptions {
  /** Pixels of empty space kept around the character. */
  padding?: number;
  /** Integer scale for crisp pixel art. */
  scale?: number;
  background?: string | null;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(src);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`이미지를 불러오지 못했습니다: ${src.slice(0, 80)}`));
      img.src = src;
    });
    pending.catch(() => imageCache.delete(src));
    imageCache.set(src, pending);
  }
  return pending;
}

export interface RenderResult {
  width: number;
  height: number;
  /** Layers that failed to load (drawn without them). */
  failed: string[];
}

/** Draw layers onto `canvas`, resizing it to fit the character bounds. */
export async function renderCharacter(
  canvas: HTMLCanvasElement,
  layers: RenderLayer[],
  { padding = 8, scale = 1, background = null }: RenderOptions = {},
): Promise<RenderResult> {
  const sorted = [...layers].sort((a, b) => a.order - b.order);
  const settled = await Promise.allSettled(sorted.map((l) => loadImage(l.src)));
  const drawable = sorted
    .map((layer, i) => ({ layer, img: settled[i].status === "fulfilled" ? settled[i].value : null }))
    .filter((d): d is { layer: RenderLayer; img: HTMLImageElement } => d.img !== null);
  const failed = sorted.filter((_, i) => settled[i].status === "rejected").map((l) => l.key);

  if (!drawable.length) {
    canvas.width = canvas.height = 0;
    return { width: 0, height: 0, failed };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { layer, img } of drawable) {
    minX = Math.min(minX, layer.x);
    minY = Math.min(minY, layer.y);
    maxX = Math.max(maxX, layer.x + img.naturalWidth);
    maxY = Math.max(maxY, layer.y + img.naturalHeight);
  }
  const width = Math.ceil(maxX - minX + padding * 2);
  const height = Math.ceil(maxY - minY + padding * 2);

  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  for (const { layer, img } of drawable) {
    ctx.drawImage(img, Math.round(layer.x - minX + padding), Math.round(layer.y - minY + padding));
  }
  return { width, height, failed };
}

/** Render off-screen at the given scale and return a PNG blob. */
export async function exportPNG(layers: RenderLayer[], options: RenderOptions = {}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const { width } = await renderCharacter(canvas, layers, options);
  if (!width) throw new Error("그릴 레이어가 없습니다.");
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG 변환에 실패했습니다."))), "image/png"),
  );
}
