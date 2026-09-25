/** Designer UI categories. Shared by the asset collector (writer) and the app (reader). */
export const DESIGNER_CATEGORIES = [
  "body",
  "face",
  "hair",
  "hat",
  "face-accessory",
  "eye-accessory",
  "earrings",
  "top",
  "bottom",
  "overall",
  "shoes",
  "gloves",
  "cape",
  "weapon",
  "shield",
  "ring",
  "medal",
  "pendant",
  "etc",
] as const;

export type DesignerCategory = (typeof DESIGNER_CATEGORIES)[number];

/** Normalized item stored in data/items/{category}.json. The item id is the canonical identifier. */
export interface MapleItem {
  id: number;
  name: string;
  category: DesignerCategory;
  /** Original API subCategory, kept for debugging and finer filters. */
  subCategory?: string;
  /** Icon path relative to the site root, e.g. "assets/items/hat/1000000.png". */
  icon?: string;
  iconRaw?: string;
  description?: string;
  isCash?: boolean;
  requiredGender?: number;
  raw?: unknown;
}

/** One entry of data/categories.json. */
export interface CategorySummary {
  id: DesignerCategory;
  count: number;
  /** Items whose icon has been downloaded. */
  withIcon?: number;
}

/** data/manifest.json */
export interface AssetManifest {
  version: string;
  generatedAt: string;
  totalItems: number;
  iconsOnDisk: number;
  lastRun: { targets: number; downloaded: number; skipped: number; failed: number };
}
