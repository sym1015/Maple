import type { ApiTypeInfo, DesignerCategory } from "./types";

/**
 * API typeInfo → designer UI category.
 *
 * Keys are the exact strings the API returns (checked against GET /item/category on gms/270).
 * Anything not listed falls back to "etc" and is logged by the collector, so new or
 * unexpected values never stop a download; add them here once you have seen them.
 */
export const SUB_CATEGORY_MAP: Record<string, DesignerCategory> = {
  // equip.accessory (verified)
  "Face Accessory": "face-accessory",
  "Eye Decoration": "eye-accessory",
  Earrings: "earrings",
  Earring: "earrings",
  Ring: "ring",
  Pendant: "pendant",
  Medal: "medal",
};

/** Fallback by typeInfo.category when the subCategory is not listed above. */
export const CATEGORY_MAP: Record<string, DesignerCategory> = {};

export interface MappingResult {
  category: DesignerCategory;
  mapped: boolean;
}

export function mapCategory(typeInfo: ApiTypeInfo | undefined): MappingResult {
  if (typeInfo) {
    const bySub = SUB_CATEGORY_MAP[typeInfo.subCategory];
    if (bySub) return { category: bySub, mapped: true };
    const byCat = CATEGORY_MAP[typeInfo.category];
    if (byCat) return { category: byCat, mapped: true };
  }
  return { category: "etc", mapped: false };
}
