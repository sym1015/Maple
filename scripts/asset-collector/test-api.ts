/**
 * npm run assets:test
 *
 * Hits each endpoint the collector will depend on and prints what actually
 * came back (URL, HTTP status, content type, detected fields, a sample), so the
 * parser can be written against real responses instead of guesses.
 * A full report is also written to data/api-test-report.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config, versionedBase } from "./config";
import { request, type HttpResult } from "./http";

const SAMPLE_ITEM_ID = Number(process.env.ASSET_TEST_ITEM_ID ?? 1302000);
const SAMPLE_CHARS = 600;

interface Check {
  label: string;
  url: string;
  status: number;
  ok: boolean;
  contentType: string;
  bytes: number;
  error?: string;
  shape?: string;
  fields?: string[];
  sample?: string;
}

function describeJson(value: unknown): { shape: string; fields?: string[] } {
  if (Array.isArray(value)) {
    const first = value[0];
    const inner = first === null ? "null" : Array.isArray(first) ? "array" : typeof first;
    return {
      shape: `array(length=${value.length}) of ${inner}`,
      fields: first && typeof first === "object" && !Array.isArray(first) ? Object.keys(first) : undefined,
    };
  }
  if (value && typeof value === "object") {
    return { shape: "object", fields: Object.keys(value) };
  }
  return { shape: typeof value };
}

function inspect(label: string, res: HttpResult): { check: Check; json?: unknown } {
  const check: Check = {
    label,
    url: res.url,
    status: res.status,
    ok: res.ok,
    contentType: res.contentType,
    bytes: res.body.length,
    error: res.error,
  };
  let json: unknown;
  if (res.contentType.includes("json")) {
    try {
      json = JSON.parse(res.body.toString("utf8"));
      Object.assign(check, describeJson(json));
      const sample = Array.isArray(json) ? json.slice(0, 3) : json;
      check.sample = JSON.stringify(sample).slice(0, SAMPLE_CHARS);
    } catch {
      check.shape = "invalid JSON";
    }
  } else if (res.contentType.startsWith("image/")) {
    check.shape = `image (${res.body.length} bytes)`;
  } else if (res.body.length) {
    check.sample = res.body.toString("utf8").slice(0, SAMPLE_CHARS);
  }
  if (res.ok && label.startsWith("Icon") && !res.contentType.startsWith("image/")) {
    check.ok = false;
    check.error = `이미지가 아닌 응답 (${res.contentType || "content-type 없음"})`;
  }
  return { check, json };
}

/** Pick a category name to probe from whatever /item/category returned, without assuming its shape. */
function firstCategory(json: unknown): string | undefined {
  if (Array.isArray(json)) {
    const first = json[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const o = first as Record<string, unknown>;
      for (const key of ["name", "category", "overallCategory", "id"]) {
        if (typeof o[key] === "string") return o[key] as string;
      }
    }
  } else if (json && typeof json === "object") {
    return Object.keys(json)[0];
  }
  return undefined;
}

interface WzEntry {
  region: string;
  mapleVersionId: string;
  isReady?: boolean;
  hasImages?: boolean;
}

/** Summarise /wz by region and return the newest ready-with-images version per region. */
function summariseVersions(json: unknown): Map<string, { count: number; newest?: string }> {
  const out = new Map<string, { count: number; newest?: string }>();
  if (!Array.isArray(json)) return out;
  for (const e of json as WzEntry[]) {
    if (!e || typeof e.region !== "string") continue;
    const cur = out.get(e.region) ?? { count: 0 };
    cur.count++;
    if (e.isReady && e.hasImages) {
      const a = Number(e.mapleVersionId);
      const b = Number(cur.newest);
      if (cur.newest === undefined || (Number.isFinite(a) && (!Number.isFinite(b) || a > b))) {
        cur.newest = e.mapleVersionId;
      }
    }
    out.set(e.region, cur);
  }
  return out;
}

async function main() {
  console.log(`API base      : ${config.apiBase}`);
  console.log(`Versioned base: ${versionedBase}`);
  console.log(`Timeout ${config.timeoutMs}ms, retries ${config.retries}\n`);

  const checks: Check[] = [];
  const run = async (label: string, url: string) => {
    const result = inspect(label, await request(url));
    checks.push(result.check);
    return result;
  };

  const wz = await run("API connection", `${config.apiBase}/wz`);

  // The configured region/version may not exist verbatim (e.g. "latest", or case differences).
  // Probe a single cheap item URL across candidates taken from the real /wz response.
  const versions = summariseVersions(wz.json);
  if (versions.size) {
    console.log("Detected regions (entries / newest ready version with images):");
    for (const [region, v] of versions) console.log(`  ${region}: ${v.count} / ${v.newest ?? "-"}`);
    console.log("");
  }
  const regionMatch = [...versions.keys()].find((r) => r.toLowerCase() === config.region.toLowerCase());
  const regionCandidates = [...new Set([config.region, config.region.toUpperCase(), regionMatch].filter(Boolean))] as string[];
  const newest = regionMatch ? versions.get(regionMatch)?.newest : undefined;
  const versionCandidates = [...new Set([config.version, newest].filter(Boolean))] as string[];

  let base = versionedBase;
  for (const region of regionCandidates) {
    for (const version of versionCandidates) {
      const candidate = `${config.apiBase}/${region}/${version}`;
      const probe = await run(`Probe ${region}/${version}`, `${candidate}/item/${SAMPLE_ITEM_ID}/name`);
      if (probe.check.ok && base === versionedBase) base = candidate;
    }
  }
  if (base !== versionedBase) {
    console.log(`설정값(${versionedBase})은 실패했고, 대신 동작하는 주소를 찾았습니다: ${base}`);
    console.log(`→ .env 의 MAPLE_REGION / MAPLE_VERSION 을 이 값으로 바꾸면 됩니다.\n`);
  }

  await run("Item endpoint", `${base}/item`);
  const categories = await run("Category endpoint", `${base}/item/category`);

  const category = firstCategory(categories.json);
  if (category) {
    await run(`Category detail (${category})`, `${base}/item/category/${encodeURIComponent(category)}`);
  } else {
    checks.push({
      label: "Category detail",
      url: `${base}/item/category/{category}`,
      status: 0,
      ok: false,
      contentType: "",
      bytes: 0,
      error: "카테고리 목록 응답에서 카테고리 이름을 찾지 못해 건너뜀",
    });
  }

  await run("Item detail", `${base}/item/${SAMPLE_ITEM_ID}`);
  await run("Item name", `${base}/item/${SAMPLE_ITEM_ID}/name`);
  await run("Icon endpoint", `${base}/item/${SAMPLE_ITEM_ID}/icon`);
  await run("IconRaw endpoint", `${base}/item/${SAMPLE_ITEM_ID}/iconRaw`);

  for (const c of checks) {
    console.log(`${c.label}: ${c.ok ? "OK" : "FAIL"}`);
    console.log(`  URL          : ${c.url}`);
    console.log(`  HTTP status  : ${c.status || "(응답 없음)"}${c.error ? `  [${c.error}]` : ""}`);
    if (c.contentType) console.log(`  Content-Type : ${c.contentType}`);
    if (c.shape) console.log(`  Shape        : ${c.shape}`);
    if (c.fields) console.log(`  Fields       : ${c.fields.join(", ")}`);
    if (c.sample) console.log(`  Sample       : ${c.sample}`);
    console.log("");
  }

  const outDir = path.join(config.root, "data");
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "api-test-report.json");
  writeFileSync(
    reportPath,
    JSON.stringify({ testedAt: new Date().toISOString(), configuredBase: versionedBase, workingBase: base, versions: Object.fromEntries(versions), checks }, null, 2) + "\n",
  );

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`결과: ${checks.length - failed}/${checks.length} 성공. 상세 보고서: ${path.relative(config.root, reportPath)}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
