/**
 * Minimal PNG decoder (8-bit RGBA / RGB, non-interlaced) for inspection scripts.
 * Used to compare frames by pixels and to find the opaque bounding box.
 */
import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  pixels: Buffer;
}

export function decodePng(buf: Buffer): DecodedPng {
  if (buf.subarray(1, 4).toString() !== "PNG") throw new Error("PNG 아님");
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | undefined;
  let trns: Buffer | undefined;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0) throw new Error(`지원하지 않는 PNG (bitDepth=${bitDepth}, interlace=${interlace})`);
  const channels = { 6: 4, 2: 3, 3: 1, 0: 1, 4: 2 }[colorType];
  if (!channels) throw new Error(`지원하지 않는 colorType ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 0xff;
    }
  }

  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (colorType === 6) out.copy(pixels, i * 4, i * 4, i * 4 + 4);
    else if (colorType === 2) {
      out.copy(pixels, i * 4, i * 3, i * 3 + 3);
      pixels[i * 4 + 3] = 255;
    } else if (colorType === 3 && palette) {
      const idx = out[i];
      palette.copy(pixels, i * 4, idx * 3, idx * 3 + 3);
      pixels[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
    } else if (colorType === 0) {
      pixels.fill(out[i], i * 4, i * 4 + 3);
      pixels[i * 4 + 3] = 255;
    } else if (colorType === 4) {
      pixels.fill(out[i * 2], i * 4, i * 4 + 3);
      pixels[i * 4 + 3] = out[i * 2 + 1];
    }
  }
  return { width, height, pixels };
}

/** Bounding box of pixels with alpha > 0, or null for a fully transparent image. */
export function opaqueBounds({ width, height, pixels }: DecodedPng) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}
