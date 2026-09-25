/**
 * Loads the data produced by `npm run assets:collect` (data/, assets/).
 * The browser never talks to the MapleStory API directly; each category file is
 * fetched only when first needed and then cached in memory.
 */
import type { AssetManifest, CategorySummary, DesignerCategory, MapleItem } from "../types/item";

const itemCache = new Map<DesignerCategory, Promise<MapleItem[]>>();

/** Resolve a data-relative path (e.g. "assets/items/hat/1.png") against the page base. */
export function assetUrl(relativePath: string): string {
  return new URL(relativePath.replace(/^\/+/, ""), document.baseURI).toString();
}

async function fetchJson<T>(relativePath: string): Promise<T | null> {
  const res = await fetch(assetUrl(relativePath));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${relativePath} 불러오기 실패 (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadManifest(): Promise<AssetManifest | null> {
  return fetchJson<AssetManifest>("data/manifest.json");
}

export async function loadCategories(): Promise<CategorySummary[] | null> {
  return fetchJson<CategorySummary[]>("data/categories.json");
}

export function loadCategoryItems(category: DesignerCategory): Promise<MapleItem[]> {
  let pending = itemCache.get(category);
  if (!pending) {
    pending = fetchJson<Record<string, MapleItem>>(`data/items/${category}.json`).then((map) =>
      Object.values(map ?? {}).sort((a, b) => a.id - b.id),
    );
    // Drop failed loads from the cache so a retry can succeed.
    pending.catch(() => itemCache.delete(category));
    itemCache.set(category, pending);
  }
  return pending;
}
