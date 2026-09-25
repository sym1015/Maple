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
import { resolveBase } from "./api";
import { config } from "./config";

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
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
