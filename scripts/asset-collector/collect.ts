/**
 * npm run assets:collect [-- --category=hat] [-- --id=1302000] [-- --limit=10] [-- --dry-run]
 *   --limit=0 only refreshes data/ (no downloads).
 *
 * 1. Resolves the API base (MAPLE_VERSION=latest → newest real version from /wz).
 * 2. Fetches the equip item list and normalizes it (category-map.ts).
 * 3. Downloads icons to assets/items/{category}/{id}.png with limited concurrency,
 *    delay, timeout and retry; files that already exist are skipped.
 * 4. Writes data/items/{category}.json, data/items.json, data/categories.json,
 *    data/manifest.json and data/download-failures.json.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveBase, getJson } from "./api";
import { mapCategory } from "./category-map";
import { config } from "./config";
import { request } from "./http";
import { runPool } from "./pool";
import { DESIGNER_CATEGORIES, type ApiItemSummary, type DesignerCategory, type MapleItem } from "./types";

interface Args {
  category?: DesignerCategory;
  ids?: number[];
  limit?: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "dry-run") args.dryRun = true;
    else if (key === "category") {
      if (!DESIGNER_CATEGORIES.includes(value as DesignerCategory)) {
        throw new Error(`알 수 없는 카테고리: ${value}. 사용 가능: ${DESIGNER_CATEGORIES.join(", ")}`);
      }
      args.category = value as DesignerCategory;
    } else if (key === "id") args.ids = value.split(",").map(Number).filter(Number.isFinite);
    else if (key === "limit") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0) throw new Error(`--limit 은 0 이상의 정수여야 합니다: ${value}`);
      args.limit = n;
    }
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  return args;
}

interface Failure {
  id: number;
  category: DesignerCategory;
  url: string;
  status: number;
  error?: string;
  attempts: number;
}

/** Item lists are written compactly (no indentation): hair alone has 17k entries. */
const writeJson = (file: string, data: unknown, pretty = false) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, (pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)) + "\n");
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { base, region, version } = await resolveBase();
  console.log(`API: ${base}${config.version !== version ? `  (MAPLE_VERSION=${config.version} → ${version})` : ""}`);
  console.log(`concurrency=${config.concurrency} delay=${config.delayMs}ms retries=${config.retries} timeout=${config.timeoutMs}ms`);
  if (args.dryRun) console.log("DRY RUN: 파일을 다운로드하거나 쓰지 않습니다.");

  // Category tree, kept verbatim so the mapping can be reviewed against the real values.
  const categoryTree = await getJson<Record<string, Record<string, { item1: string; item2: number; item3: number }[]>>>(
    `${base}/item/category`,
  );

  const list = await getJson<ApiItemSummary[]>(`${base}/item/category/equip`);
  console.log(`equip 아이템 ${list.length}개 수신`);

  const unmapped = new Map<string, number>();
  const allItems: MapleItem[] = list.map((raw) => {
    const { category, mapped } = mapCategory(raw.typeInfo);
    if (!mapped) {
      const key = `${raw.typeInfo?.category ?? "?"} / ${raw.typeInfo?.subCategory ?? "?"}`;
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1);
    }
    return {
      id: raw.id,
      name: raw.name,
      category,
      subCategory: raw.typeInfo?.subCategory,
      description: raw.desc || undefined,
      isCash: raw.isCash,
      requiredGender: raw.requiredGender,
      icon: `assets/items/${category}/${raw.id}.png`,
    };
  });

  // Options only choose which icons to download; metadata is always written for every item
  // so repeated runs with different --category values never hide earlier categories.
  let items = allItems;
  if (args.ids) items = items.filter((i) => args.ids!.includes(i.id));
  if (args.category) items = items.filter((i) => i.category === args.category);
  // --limit=0 downloads nothing and only refreshes the item lists.
  if (args.limit !== undefined) items = items.slice(0, args.limit);

  // Category summary: every (category / subCategory) pair seen and where it maps to.
  const pairs = new Map<string, { count: number; to: DesignerCategory; mapped: boolean }>();
  for (const raw of list) {
    const key = `${raw.typeInfo?.category ?? "?"} / ${raw.typeInfo?.subCategory ?? "?"}`;
    const m = mapCategory(raw.typeInfo);
    const cur = pairs.get(key) ?? { count: 0, to: m.category, mapped: m.mapped };
    cur.count++;
    pairs.set(key, cur);
  }
  console.log("\nDetected categories (API category / subCategory → designer):");
  for (const [key, v] of [...pairs].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${key.padEnd(48)} ${String(v.count).padStart(6)}  → ${v.to}${v.mapped ? "" : "  (미매핑)"}`);
  }
  const perDesigner = new Map<DesignerCategory, number>();
  for (const v of pairs.values()) perDesigner.set(v.to, (perDesigner.get(v.to) ?? 0) + v.count);
  console.log("\nDesigner category totals:");
  for (const c of DESIGNER_CATEGORIES) console.log(`  ${c.padEnd(16)} ${perDesigner.get(c) ?? 0}`);
  if (unmapped.size) {
    console.log(`\n매핑되지 않아 etc 로 분류된 조합 ${unmapped.size}개. category-map.ts 에 추가하세요.`);
  }

  console.log(`\n처리 대상: ${items.length}개`);
  const stats = { total: items.length, downloaded: 0, skipped: 0, failed: 0 };
  const failures: Failure[] = [];

  // Written before downloading (so every category shows up right away), every
  // WRITE_EVERY processed icons, and at the end; long runs no longer hide new data.
  const writeData = (final: boolean) => {
    // Link every icon that exists on disk (from this or earlier runs).
    let iconsOnDisk = 0;
    for (const item of allItems) {
      const exists = existsSync(path.join(config.root, "assets", "items", item.category, `${item.id}.png`));
      item.icon = exists ? `assets/items/${item.category}/${item.id}.png` : undefined;
      if (exists) iconsOnDisk++;
    }

    const dataDir = path.join(config.root, "data");
    const byCategory: Partial<Record<DesignerCategory, Record<string, MapleItem>>> = {};
    for (const item of allItems) (byCategory[item.category] ??= {})[item.id] = item;
    for (const [category, entries] of Object.entries(byCategory)) {
      writeJson(path.join(dataDir, "items", `${category}.json`), entries);
    }
    // The combined file is large; only write it at the end of a run.
    if (final) writeJson(path.join(dataDir, "items.json"), Object.fromEntries(allItems.map((i) => [i.id, i])));
    writeJson(
      path.join(dataDir, "categories.json"),
      DESIGNER_CATEGORIES.map((id) => {
        const entries = Object.values(byCategory[id] ?? {});
        return { id, count: entries.length, withIcon: entries.filter((i) => i.icon).length };
      }),
    );
    writeJson(path.join(dataDir, "raw", "item-category.json"), categoryTree);
    writeJson(path.join(dataDir, "download-failures.json"), failures, true);
    writeJson(path.join(dataDir, "manifest.json"), {
      version: `${region}/${version}`,
      generatedAt: new Date().toISOString(),
      totalItems: allItems.length,
      iconsOnDisk,
      lastRun: { targets: stats.total, downloaded: stats.downloaded, skipped: stats.skipped, failed: stats.failed },
    });
  };
  const WRITE_EVERY = 500;

  if (!args.dryRun) {
    writeData(false);
    console.log("data/ 목록을 먼저 저장했습니다. 다운로드 중에도 500개마다 갱신됩니다.");
  }

  // Skip icons that already exist up front, so resuming does not wait out the request
  // delay once per existing file (tens of thousands of files = tens of minutes of silence).
  const iconFile = (item: MapleItem) => path.join(config.root, "assets", "items", item.category, `${item.id}.png`);
  const pending = items.filter((item) => !existsSync(iconFile(item)));
  stats.skipped = items.length - pending.length;
  console.log(`이미 받은 아이콘 ${stats.skipped}개는 건너뜁니다. 새로 받을 아이콘: ${pending.length}개`);

  const startedAt = Date.now();
  await runPool(pending, config.concurrency, config.delayMs, async (item) => {
    const file = iconFile(item);
    const url = `${base}/item/${item.id}/icon`;
    if (args.dryRun) {
      console.log(`  [dry-run] ${url} → ${path.relative(config.root, file)}`);
      return;
    }
    const res = await request(url);
    if (res.ok && res.contentType.startsWith("image/")) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, res.body);
      stats.downloaded++;
    } else {
      stats.failed++;
      failures.push({
        id: item.id,
        category: item.category,
        url,
        status: res.status,
        error: res.error ?? (res.ok ? `not an image: ${res.contentType}` : undefined),
        attempts: res.attempts,
      });
    }
    const done = stats.downloaded + stats.failed;
    if (done % 100 === 0 || done === pending.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const remainMin = Math.ceil(((elapsed / done) * (pending.length - done)) / 60);
      console.log(
        `  진행 ${done}/${pending.length} (${Math.floor((done / pending.length) * 100)}%) · 실패 ${stats.failed} · 남은 시간 약 ${remainMin}분`,
      );
    }
    if (!args.dryRun && done % WRITE_EVERY === 0) writeData(false);
  });

  console.log(`\nTotal: ${stats.total}\nDownloaded: ${stats.downloaded}\nSkipped: ${stats.skipped}\nFailed: ${stats.failed}`);
  if (args.dryRun) return;

  writeData(true);
  console.log(`data/ 에 JSON 을 저장했습니다.${failures.length ? " 실패 목록: data/download-failures.json" : ""}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
