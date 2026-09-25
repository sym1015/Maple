/**
 * npm run assets:inspect [-- --id=2000,12000]
 *
 * Prints the real structure of the data needed for layered rendering, so the renderer
 * is written against actual responses:
 *  - GET {base}/zmap (layer order)
 *  - GET {base}/item/{id} frameBooks for a few items per category (stand1, frame 0):
 *    part names, their fields, origin, map points and z layer.
 * Base64 image strings are replaced by their length.
 */
import { resolveBase } from "./api";
import { mapCategory } from "./category-map";
import { request } from "./http";
import type { ApiItemSummary, DesignerCategory } from "./types";

const PROBE_CATEGORIES: DesignerCategory[] = ["hair", "face", "hat", "top", "bottom", "overall", "shoes", "weapon", "cape", "gloves"];

function redact(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.length > 80 ? `<string ${value.length} chars>` : value;
  if (Array.isArray(value)) return value.slice(0, 5).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 6) return "<…>";
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, depth + 1)]));
  }
  return value;
}

async function show(label: string, url: string): Promise<unknown> {
  const res = await request(url);
  console.log(`\n=== ${label}\nURL: ${url}\nHTTP ${res.status || "(응답 없음)"} ${res.contentType} (${res.body.length} bytes) CORS=${res.cors ?? "없음"}${res.error ? ` [${res.error}]` : ""}`);
  if (!res.ok || !res.contentType.includes("json")) {
    if (res.body.length && !res.contentType.startsWith("image/")) console.log(res.body.toString("utf8").slice(0, 300));
    return undefined;
  }
  return JSON.parse(res.body.toString("utf8"));
}

function describeItem(json: unknown) {
  if (!json || typeof json !== "object") return;
  const item = json as Record<string, unknown>;
  console.log(`Top-level fields: ${Object.keys(item).join(", ")}`);
  if (item.typeInfo) console.log(`typeInfo: ${JSON.stringify(item.typeInfo)}`);
  if (item.metaInfo) console.log(`metaInfo keys: ${Object.keys(item.metaInfo as object).join(", ")}`);
  const books = item.frameBooks as Record<string, { frames?: unknown[] }> | undefined;
  if (!books) {
    console.log("frameBooks: 없음");
    return;
  }
  const actions = Object.keys(books);
  console.log(`frameBooks actions (${actions.length}): ${actions.slice(0, 30).join(", ")}${actions.length > 30 ? " …" : ""}`);
  const action = books.stand1 ? "stand1" : books.default ? "default" : actions[0];
  const frames = books[action]?.frames ?? [];
  console.log(`[${action}] frames: ${frames.length}`);
  const frame = frames[0] as Record<string, unknown> | undefined;
  if (!frame) return;
  console.log(`frame[0] fields: ${Object.keys(frame).join(", ")}`);
  console.log(`frame[0] (redacted): ${JSON.stringify(redact(frame), null, 1).slice(0, 2500)}`);
}

async function main() {
  const { base } = await resolveBase();
  const idsArg = process.argv.find((a) => a.startsWith("--id="));
  const extraIds = idsArg ? idsArg.slice(5).split(",").map(Number) : [];

  const zmap = await show("zmap", `${base}/zmap`);
  if (Array.isArray(zmap)) console.log(`zmap: array(${zmap.length}) → ${JSON.stringify(zmap)}`);
  else if (zmap) console.log(`zmap: ${JSON.stringify(redact(zmap)).slice(0, 1500)}`);

  for (const id of extraIds) describeItem(await show(`item ${id}`, `${base}/item/${id}`));

  // Skin (body/head) is not served by /item; probe the Character endpoints instead.
  const skins = await show("Character skin list", `${base}/Character`);
  if (skins) console.log(`skins: ${JSON.stringify(redact(skins)).slice(0, 600)}`);
  // Server-side composite render: try the item-list formats seen in the legacy app and source.
  const { region, version } = await resolveBase();
  const entry = (id: number) => ({ itemId: id, region: region.toUpperCase(), version });
  const jsonItems = encodeURIComponent([2000, 12000, 30000, 20000].map((id) => JSON.stringify(entry(id))).join(","));
  const renderCandidates = [
    `${base}/Character/2000`,
    `${base}/Character/2000/30000`,
    `${base}/Character/2000/30000,20000`,
    `${base}/Character/2000/30000,20000/stand1/0`,
    `${base}/Character/center/2000/30000,20000/stand1/0`,
    `${base}/Character/base/2000`,
    `${base}/Character/actions/30000,20000`,
    `${base.replace(/\/[^/]+\/[^/]+$/, "")}/character/${jsonItems}/stand1/0`,
  ];
  for (const url of renderCandidates) {
    const detail = await show("render probe", url);
    if (detail !== undefined) console.log(`json (redacted): ${JSON.stringify(redact(detail), null, 1).slice(0, 1500)}`);
  }

  const list = await request(`${base}/item/category/equip`);
  const items = JSON.parse(list.body.toString("utf8")) as ApiItemSummary[];
  for (const category of PROBE_CATEGORIES) {
    const first = items.find((i) => mapCategory(i.typeInfo).category === category);
    if (!first) continue;
    describeItem(await show(`${category}: ${first.name} (${first.id})`, `${base}/item/${first.id}`));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
