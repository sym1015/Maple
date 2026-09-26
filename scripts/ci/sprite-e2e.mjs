/**
 * CI end-to-end check of the sprite exporter against the real API.
 * Requires: dev server on E2E_URL, playwright installed, data/manifest.json present.
 *
 * Exports every action for a fixed character, downloads the ZIP and checks with numbers only:
 *  - our frame count == server ZIP frame files - 1 (the server repeats frame 0 at the end)
 *  - equal cell sizes, stable feet row for stand1, PNG count == JSON frames, sheet size
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { chromium } from "playwright";
import { decodePng } from "../asset-collector/png.ts";

const URL = process.env.E2E_URL ?? "http://localhost:5174/";
const EQUIPMENT = { hair: 30000, face: 20000, top: 1040000, bottom: 1060000, weapon: 1302000 };
const manifest = JSON.parse(readFileSync("data/manifest.json", "utf8"));
const apiBase = process.env.MAPLE_API_BASE.replace(/\/+$/, "");
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "통과" : "실패"} ${msg}`);
  if (!ok) failures++;
};

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// Server reference: frame files per action in default/0 of the server ZIP.
const items = [EQUIPMENT.face, EQUIPMENT.hair, EQUIPMENT.top, EQUIPMENT.bottom, EQUIPMENT.weapon].join(",");
const serverRes = await fetch(`${apiBase}/${manifest.version}/Character/download/2000/${items}`);
const serverType = serverRes.headers.get("content-type") ?? "";
const isZip = serverRes.ok && serverType.startsWith("application/zip");
const serverZip = isZip ? unzipSync(new Uint8Array(await serverRes.arrayBuffer())) : {};
if (!isZip) console.log(`서버 ZIP을 받지 못해 프레임 수 비교는 건너뜁니다 (HTTP ${serverRes.status} ${serverType})`);

const serverFrames = {};
for (const name of Object.keys(serverZip)) {
  const m = /^default\/0\/(.+)_(\d+)\.png$/.exec(name);
  if (m) serverFrames[m[1]] = Math.max(serverFrames[m[1]] ?? 0, Number(m[2]) + 1);
}
console.log(`서버 ZIP default/0 동작별 파일 수: ${JSON.stringify(serverFrames)}`);

// The server ZIP turned out to be incomplete from run to run, so it is only informational.
async function nodeFrameCount(action) {
  const hashes = [];
  for (let frame = 0; frame < 64; frame++) {
    const r = await fetch(`${apiBase}/${manifest.version}/Character/feetCenter/2000/${items}/${action}/${frame}`);
    const d = decodePng(Buffer.from(await r.arrayBuffer()));
    hashes.push(createHash("sha1").update(`${d.width}x${d.height}`).update(d.pixels).digest("hex"));
    for (let p = 1; p <= hashes.length; p++) {
      if (hashes.length < p + Math.max(p, 3)) break;
      if (hashes.every((h, i) => h === hashes[i % p])) return p;
    }
  }
  return -1;
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL);
await page.evaluate((eq) => localStorage.setItem("maple-character-state", JSON.stringify({ equipment: eq })), EQUIPMENT);
await page.reload();
await page.getByRole("button", { name: "스프라이트 시트" }).click();
const panel = page.getByRole("region", { name: "스프라이트 시트 내보내기" });
await panel.locator('input[data-action="stand1"]').waitFor({ timeout: 60000 });
const actions = await panel.locator("input[data-action]").evaluateAll((els) => els.map((e) => e.dataset.action));
console.log(`앱이 받은 동작 목록 (${actions.length}): ${actions.join(", ")}`);
await panel.getByLabel("확대").selectOption("1");
const started = Date.now();
await panel.getByRole("button", { name: /^전체: 모든 동작/ }).click();
await panel.getByRole("button", { name: /ZIP 받기/ }).waitFor({ timeout: 600000 });
console.log(`전체 내보내기 소요: ${((Date.now() - started) / 1000).toFixed(1)}초`);

const failedText = (await panel.locator("pre").count()) ? await panel.locator("pre").innerText() : "";
check(!failedText, `실패 프레임 없음 ${failedText.replace(/\s+/g, " ").slice(0, 200)}`);

const [download] = await Promise.all([page.waitForEvent("download"), panel.getByRole("button", { name: /ZIP 받기/ }).click()]);
const zip = unzipSync(new Uint8Array(readFileSync(await download.path())));
const ourManifest = JSON.parse(new TextDecoder().decode(zip["CharacterSpriteSheet/manifest.json"]));
check(ourManifest.animations.length === actions.length, `ZIP 동작 수 ${ourManifest.animations.length} = 목록 ${actions.length}`);

for (const anim of ourManifest.animations) {
  const dir = `CharacterSpriteSheet/${anim.id}`;
  const meta = JSON.parse(new TextDecoder().decode(zip[`${dir}/${anim.id}.json`]));
  const pngs = Object.keys(zip).filter((n) => new RegExp(`^${dir}/\\d+\\.png$`).test(n));
  const sizes = pngs.map((n) => pngSize(Buffer.from(zip[n])));
  const sheet = pngSize(Buffer.from(zip[`${dir}/spritesheet.png`]));
  // Independent reference: request frames directly and find the pixel repeat period in node.
  const expected = await nodeFrameCount(anim.id);
  check(anim.frameCount === expected, `${anim.id}: 프레임 ${anim.frameCount}장 (node 직접 확인 ${expected}장, 참고: 서버 ZIP ${serverFrames[anim.id] ?? "없음"}개)`);
  check(pngs.length === meta.frames.length && meta.frames.length === anim.frameCount, `${anim.id}: PNG ${pngs.length}개 = JSON 프레임 ${meta.frames.length}개`);
  check(new Set(sizes.map((s) => `${s.w}x${s.h}`)).size === 1 && sizes[0].w === meta.frameWidth && sizes[0].h === meta.frameHeight, `${anim.id}: 칸 크기 모두 ${meta.frameWidth}x${meta.frameHeight}`);
  check(sheet.w === meta.columns * meta.frameWidth && sheet.h === meta.rows * meta.frameHeight, `${anim.id}: 시트 ${sheet.w}x${sheet.h} = ${meta.columns}열 x ${meta.rows}행`);
}

// Anchor fidelity: relative to the anchor, the lowest opaque row and its x-range in our
// exported frames must equal those in the raw feetCenter frames from the API. (Frames may
// legitimately sway; e.g. stand1 frame 2 sits 1px right of frames 0-1 in the API itself.)
function feetRow(png, ax, ay) {
  const d = decodePng(Buffer.from(png));
  let bottom = -1;
  for (let y = d.height - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < d.width; x++) if (d.pixels[(y * d.width + x) * 4 + 3]) bottom = y;
  let minX = d.width, maxX = -1;
  for (let x = 0; x < d.width; x++) if (d.pixels[(bottom * d.width + x) * 4 + 3]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  return `y${bottom - ay}:x${minX - ax}..${maxX - ax}`;
}
for (const action of ["stand1", "walk1"]) {
  const dir = `CharacterSpriteSheet/${action}`;
  const meta = JSON.parse(new TextDecoder().decode(zip[`${dir}/${action}.json`]));
  const ours = [], server = [];
  for (let i = 0; i < meta.frames.length; i++) {
    ours.push(feetRow(zip[`${dir}/${i}.png`], meta.origin.x, meta.origin.y));
    const raw = Buffer.from(await (await fetch(`${apiBase}/${manifest.version}/Character/feetCenter/2000/${items}/${action}/${i}`)).arrayBuffer());
    const d = decodePng(raw);
    server.push(feetRow(raw, Math.floor(d.width / 2), Math.floor(d.height / 2)));
  }
  check(ours.join(" ") === server.join(" "), `${action} 기준점 대비 발 위치 = 서버 원본 (앱 ${ours.join(" | ")} / 서버 ${server.join(" | ")})`);
}
check(errors.length === 0, `페이지 오류 없음 ${errors.join(" | ")}`);
await browser.close();
console.log(failures ? `실패 ${failures}건` : "모든 검사 통과");
process.exitCode = failures ? 1 : 0;
