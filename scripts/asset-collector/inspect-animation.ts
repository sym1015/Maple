/**
 * npm run assets:inspect-animation
 *
 * Probes the character animation endpoints and prints what really comes back, so the
 * sprite exporter is built on verified behaviour:
 *  - action list endpoints (Character/actions…)
 *  - frame-by-frame renders: status, PNG size, content hash (to detect wrap-around / clamping)
 *  - positioning variants (plain / center / navelCenter / feetCenter) and their headers
 *  - download / animated endpoints
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { resolveBase } from "./api";
import { config } from "./config";
import { decodePng, opaqueBounds } from "./png";

async function fetchBody(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Hash of decoded pixels (ignores PNG metadata that makes byte hashes differ). */
function pixelHash(png: Buffer): string {
  const d = decodePng(png);
  return createHash("sha1").update(`${d.width}x${d.height}`).update(d.pixels).digest("hex").slice(0, 8);
}

interface ZipEntry {
  name: string;
  method: number;
  compressed: number;
  size: number;
  localOffset: number;
}

function listZip(buf: Buffer): ZipEntry[] {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("ZIP 끝 레코드를 찾지 못함");
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(pos + 28), extraLen = buf.readUInt16LE(pos + 30), commentLen = buf.readUInt16LE(pos + 32);
    entries.push({
      name: buf.toString("utf8", pos + 46, pos + 46 + nameLen),
      method: buf.readUInt16LE(pos + 10),
      compressed: buf.readUInt32LE(pos + 20),
      size: buf.readUInt32LE(pos + 24),
      localOffset: buf.readUInt32LE(pos + 42),
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipEntry(buf: Buffer, e: ZipEntry): Buffer {
  const start = e.localOffset + 30 + buf.readUInt16LE(e.localOffset + 26) + buf.readUInt16LE(e.localOffset + 28);
  const data = buf.subarray(start, start + e.compressed);
  return e.method === 8 ? inflateRawSync(data) : Buffer.from(data);
}

const SKIN = 2000;
const ITEMS = "30000,20000,1040000,1060000,1302000";

interface Probe {
  status: number;
  type: string;
  bytes: number;
  hash: string;
  size?: string;
  headers: Record<string, string>;
  text?: string;
}

async function probe(url: string): Promise<Probe> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(config.timeoutMs) });
    const body = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get("content-type") ?? "";
    const headers: Record<string, string> = {};
    for (const [k, v] of res.headers) {
      if (!["date", "connection", "content-length", "server", "vary", "cf-ray", "alt-svc", "nel", "report-to"].includes(k)) headers[k] = v;
    }
    const isPng = body.subarray(1, 4).toString() === "PNG";
    return {
      status: res.status,
      type,
      bytes: body.length,
      hash: createHash("sha1").update(body).digest("hex").slice(0, 10),
      size: isPng ? `${body.readUInt32BE(16)}x${body.readUInt32BE(20)}` : undefined,
      headers,
      text: type.includes("json") || type.startsWith("text") ? body.toString("utf8").slice(0, 1500) : undefined,
    };
  } catch (e) {
    return { status: 0, type: "", bytes: 0, hash: "-", headers: {}, text: (e as Error).message };
  }
}

function line(label: string, p: Probe) {
  return `${label.padEnd(58)} ${String(p.status).padEnd(4)} ${p.type.split(";")[0].padEnd(18)} ${String(p.bytes).padStart(7)}B ${(p.size ?? "").padEnd(9)} ${p.hash}`;
}

async function main() {
  const { base } = await resolveBase();
  const root = base.replace(/\/[^/]+\/[^/]+$/, "");
  console.log(`base: ${base}`);

  console.log("\n### 1. Action list endpoints");
  for (const path of [
    `Character/actions`,
    `Character/actions/${ITEMS}`,
    `Character/actions/${SKIN},${SKIN + 10000},${ITEMS}`,
    `Character/actions/${SKIN}`,
  ]) {
    const p = await probe(`${base}/${path}`);
    console.log(line(path, p));
    if (p.text) console.log(`  body: ${p.text}`);
  }

  console.log("\n### 2. Frames per action (plain render). Same hash = same image.");
  for (const action of ["stand1", "stand2", "walk1", "alert", "jump", "sit", "swingO1", "prone"]) {
    for (let frame = 0; frame <= 8; frame++) {
      const p = await probe(`${base}/Character/${SKIN}/${ITEMS}/${action}/${frame}`);
      console.log(line(`${action}/${frame}`, p));
      if (p.status !== 200) {
        if (p.text) console.log(`  body: ${p.text.slice(0, 300)}`);
        break;
      }
    }
  }

  console.log("\n### 3. Positioning variants (walk1 frames 0-3): image size must stay constant for a stable sheet");
  for (const variant of ["", "center/", "navelCenter/", "feetCenter/", "compact/"]) {
    for (let frame = 0; frame <= 3; frame++) {
      const p = await probe(`${base}/Character/${variant}${SKIN}/${ITEMS}/walk1/${frame}`);
      console.log(line(`${variant || "(plain)/"}walk1/${frame}`, p));
      if (frame === 0) console.log(`  headers: ${JSON.stringify(p.headers)}`);
      if (p.text) console.log(`  body: ${p.text.slice(0, 300)}`);
    }
  }

  console.log("\n### 4. Query options on the plain render (flip/resize/renderMode)");
  for (const q of ["?flipX=true", "?resize=2", "?renderMode=2", "?showears=true"]) {
    const p = await probe(`${base}/Character/${SKIN}/${ITEMS}/stand1/0${q}`);
    console.log(line(`stand1/0${q}`, p));
  }

  console.log("\n### 5. Download / animated endpoints");
  for (const url of [
    `${base}/Character/download/${SKIN}/${ITEMS}`,
    `${base}/Character/animated/${SKIN}/${ITEMS}/walk1`,
    `${root}/character/download/${SKIN}/${ITEMS}`,
  ]) {
    const p = await probe(url);
    console.log(line(url.replace(root, ""), p));
    console.log(`  headers: ${JSON.stringify(p.headers)}`);
    if (p.text) console.log(`  body: ${p.text.slice(0, 300)}`);
  }

  await extra(base);
}

async function extra(base: string) {
  console.log("\n### 6. Pixel-level frame comparison (first repeat of frame 0 = frame count)");
  for (const action of ["stand1", "stand2", "walk1", "alert", "swingO1", "jump", "sit", "prone"]) {
    const hashes: string[] = [];
    for (let frame = 0; frame <= 9; frame++) {
      const body = await fetchBody(`${base}/Character/${SKIN}/${ITEMS}/${action}/${frame}`);
      hashes.push(body ? pixelHash(body) : "ERR");
    }
    const period = hashes.findIndex((h, i) => i > 0 && h === hashes[0] && hashes[i + 1] === hashes[1]);
    console.log(`${action.padEnd(8)} ${hashes.join(" ")}  → 반복 주기: ${period > 0 ? period : "10 이상 또는 판단 불가"}`);
  }

  console.log("\n### 7. Opaque bounds per positioning variant (is the anchor fixed inside the image?)");
  for (const variant of ["", "feetCenter/", "navelCenter/", "center/"]) {
    for (const [action, frames] of [["stand1", 3], ["walk1", 4], ["swingO1", 3]] as const) {
      for (let frame = 0; frame < frames; frame++) {
        const body = await fetchBody(`${base}/Character/${variant}${SKIN}/${ITEMS}/${action}/${frame}`);
        if (!body) {
          console.log(`${variant || "(plain)/"}${action}/${frame}: 실패`);
          continue;
        }
        const d = decodePng(body);
        const b = opaqueBounds(d);
        console.log(
          `${(variant || "(plain)/") + action + "/" + frame}`.padEnd(26) +
            ` size=${d.width}x${d.height} center=(${d.width / 2},${d.height / 2}) opaque x=${b?.minX}..${b?.maxX} y=${b?.minY}..${b?.maxY}`,
        );
      }
    }
  }

  console.log("\n### 8. Server sprite sheet ZIP contents");
  const zip = await fetchBody(`${base}/Character/download/${SKIN}/${ITEMS}`);
  if (!zip) return console.log("ZIP 다운로드 실패");
  const outDir = path.join(config.root, "data", "raw");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "sprite-sample.zip"), zip);
  const entries = listZip(zip);
  console.log(`entries: ${entries.length}, total uncompressed: ${entries.reduce((n, e) => n + e.size, 0)}B`);
  const dirs = new Map<string, number>();
  for (const e of entries) {
    const dir = e.name.includes("/") ? e.name.slice(0, e.name.lastIndexOf("/")) : "(root)";
    dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
  }
  console.log("files per folder:");
  for (const [dir, n] of [...dirs].sort()) console.log(`  ${dir.padEnd(50)} ${n}`);
  console.log("first 40 entries:");
  for (const e of entries.slice(0, 40)) console.log(`  ${e.name}  (${e.size}B)`);
  for (const e of entries.filter((x) => /\.(json|txt|xml|csv)$/i.test(x.name)).slice(0, 5)) {
    console.log(`--- ${e.name}\n${readZipEntry(zip, e).toString("utf8").slice(0, 2000)}`);
  }
  const defaults = entries.filter((e) => e.name.startsWith("default/0/")).map((e) => e.name.slice(10)).sort();
  console.log(`default/0 files (${defaults.length}): ${defaults.join(" ")}`);

  console.log("\n### 9. ZIP frames vs render frames (pixel hashes)");
  for (const action of ["stand1", "walk1", "alert", "swingO1", "jump"]) {
    const zipFrames = entries
      .filter((e) => e.name.startsWith(`default/0/${action}_`))
      .sort((a, b) => Number(a.name.split("_").pop()!.split(".")[0]) - Number(b.name.split("_").pop()!.split(".")[0]));
    const zipHashes = zipFrames.map((e) => `${e.name.split("/").pop()}=${pixelHash(readZipEntry(zip, e))}`);
    const renderHashes: string[] = [];
    for (let frame = 0; frame < Math.max(zipFrames.length, 1) + 1; frame++) {
      const body = await fetchBody(`${base}/Character/${SKIN}/${ITEMS}/${action}/${frame}`);
      renderHashes.push(`${frame}=${body ? pixelHash(body) : "ERR"}`);
    }
    console.log(`${action.padEnd(8)} zip:    ${zipHashes.join(" ")}`);
    console.log(`${"".padEnd(8)} render: ${renderHashes.join(" ")}`);
  }

  const firstPng = entries.find((e) => e.name.toLowerCase().endsWith(".png"));
  if (firstPng) {
    const d = decodePng(readZipEntry(zip, firstPng));
    console.log(`first PNG ${firstPng.name}: ${d.width}x${d.height} opaque=${JSON.stringify(opaqueBounds(d))}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
