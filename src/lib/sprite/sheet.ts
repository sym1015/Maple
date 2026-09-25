/**
 * Sprite sheet composition. Every frame gets the same cell size and its anchor is
 * placed at the same point of the cell, so the character never jitters.
 * Zoom and flip are applied to real canvas pixels (no smoothing).
 */
import type { CharacterEquipment } from "../../types/character";
import type { AnchorMode, LoadedFrame } from "./frames";

export interface SheetSettings {
  zoom: number;
  flip: boolean;
  columns: number;
  /** null = as many rows as needed. */
  rows: number | null;
  /** null = fit every frame (after zoom). */
  frameWidth: number | null;
  frameHeight: number | null;
  /** Transparent pixels around each frame, in output pixels. */
  padding: number;
  transparent: boolean;
  background: string;
  fps: number;
  anchor: AnchorMode;
}

export const DEFAULT_SHEET_SETTINGS: SheetSettings = {
  zoom: 4,
  flip: false,
  columns: 8,
  rows: null,
  frameWidth: null,
  frameHeight: null,
  padding: 0,
  transparent: true,
  background: "#ffffff",
  fps: 12,
  anchor: "feet",
};

export interface Cell {
  /** Output cell size (after zoom and padding). */
  width: number;
  height: number;
  /** Anchor position inside the cell, output pixels (before flip). */
  originX: number;
  originY: number;
}

/** Cell that fits every frame with all anchors at the same point. */
export function computeCell(frames: LoadedFrame[], s: SheetSettings): Cell {
  let left = 0, right = 0, up = 0, down = 0;
  for (const f of frames) {
    left = Math.max(left, f.anchorX);
    right = Math.max(right, f.width - f.anchorX);
    up = Math.max(up, f.anchorY);
    down = Math.max(down, f.height - f.anchorY);
  }
  const fitW = (left + right) * s.zoom + s.padding * 2;
  const fitH = (up + down) * s.zoom + s.padding * 2;
  const width = s.frameWidth ?? fitW;
  const height = s.frameHeight ?? fitH;
  // With a fixed size, centre the fitted box (it may be cropped if the size is too small).
  return {
    width,
    height,
    originX: Math.floor((width - fitW) / 2) + s.padding + left * s.zoom,
    originY: Math.floor((height - fitH) / 2) + s.padding + up * s.zoom,
  };
}

/** Draw one frame into a cell-sized area of `ctx` at (dx, dy). */
export function drawFrame(ctx: CanvasRenderingContext2D, frame: LoadedFrame, cell: Cell, s: SheetSettings, dx: number, dy: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, cell.width, cell.height);
  ctx.clip();
  if (s.flip) {
    // Mirror the whole cell around its vertical centre line.
    ctx.translate(dx * 2 + cell.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    frame.bitmap,
    dx + cell.originX - frame.anchorX * s.zoom,
    dy + cell.originY - frame.anchorY * s.zoom,
    frame.width * s.zoom,
    frame.height * s.zoom,
  );
  ctx.restore();
}

function newCanvas(width: number, height: number, s: SheetSettings) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (!s.transparent) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, width, height);
  }
  return { canvas, ctx };
}

export interface SheetFrameMeta {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  duration: number;
}

export interface SheetMetadata {
  version: 1;
  characterHash: string;
  character: { equipment: CharacterEquipment };
  animation: string;
  fps: number;
  zoom: number;
  flip: boolean;
  anchor: AnchorMode;
  /** Anchor position inside every frame cell (after flip). */
  origin: { x: number; y: number };
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  frames: SheetFrameMeta[];
}

export interface BuiltSheet {
  canvas: HTMLCanvasElement;
  cell: Cell;
  metadata: SheetMetadata;
  /** Individual frame canvases at the same cell size. */
  frameCanvases: HTMLCanvasElement[];
}

export function buildSheet(
  frames: LoadedFrame[],
  s: SheetSettings,
  info: { animation: string; characterHash: string; equipment: CharacterEquipment },
): BuiltSheet {
  const cell = computeCell(frames, s);
  const columns = Math.max(1, Math.min(s.columns, frames.length));
  const rows = s.rows ?? Math.ceil(frames.length / columns);
  const shown = frames.slice(0, columns * rows);
  const { canvas, ctx } = newCanvas(columns * cell.width, rows * cell.height, s);

  const duration = Math.round(1000 / s.fps);
  const metaFrames: SheetFrameMeta[] = [];
  const frameCanvases: HTMLCanvasElement[] = [];
  shown.forEach((frame, i) => {
    const x = (i % columns) * cell.width;
    const y = Math.floor(i / columns) * cell.height;
    drawFrame(ctx, frame, cell, s, x, y);
    metaFrames.push({ index: i, x, y, width: cell.width, height: cell.height, duration });
    const single = newCanvas(cell.width, cell.height, s);
    drawFrame(single.ctx, frame, cell, s, 0, 0);
    frameCanvases.push(single.canvas);
  });

  return {
    canvas,
    cell,
    frameCanvases,
    metadata: {
      version: 1,
      characterHash: info.characterHash,
      character: { equipment: info.equipment },
      animation: info.animation,
      fps: s.fps,
      zoom: s.zoom,
      flip: s.flip,
      anchor: s.anchor,
      origin: { x: s.flip ? cell.width - cell.originX : cell.originX, y: cell.originY },
      frameWidth: cell.width,
      frameHeight: cell.height,
      columns,
      rows,
      frames: metaFrames,
    },
  };
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 변환에 실패했습니다."))), "image/png"),
  );
}
