import type { ApiTypeInfo, DesignerCategory } from "./types";

/**
 * API typeInfo → designer UI category.
 *
 * Every key below is an exact "category / subCategory" pair (or category) returned by
 * GET /item/category/equip on gms/270. Matching on the pair matters: e.g.
 * "Secondary Weapon / Medal" is a secondary weapon, not the "Accessory / Medal" slot.
 *
 * Anything not listed falls back to "etc" and is reported by the collector, so new
 * values never stop a download; add them here once you have seen them.
 */
export const PAIR_MAP: Record<string, DesignerCategory> = {
  // Character
  "Character / Hair": "hair",
  "Character / Face": "face",
  // Skin: the API lists skin heads under "Head" (bodies are not in the equip list).
  "Character / Head": "body",

  // Armor
  "Armor / Hat": "hat",
  "Armor / Top": "top",
  "Armor / Bottom": "bottom",
  "Armor / Overall": "overall",
  "Armor / Shoes": "shoes",
  "Armor / Glove": "gloves",
  "Armor / Cape": "cape",
  "Armor / Shield": "shield",
  "Armor / Test Armor": "etc",

  // Accessory
  "Accessory / Face Accessory": "face-accessory",
  "Accessory / Eye Decoration": "eye-accessory",
  "Accessory / Earrings": "earrings",
  "Accessory / Earring": "earrings",
  "Accessory / Ring": "ring",
  "Accessory / Pendant": "pendant",
  "Accessory / Medal": "medal",
  "Accessory / Badge": "etc",
  "Accessory / Belt": "etc",
  "Accessory / Emblem": "etc",
  "Accessory / Pocket Item": "etc",
  "Accessory / Shoulder Accessory": "etc",
  "Accessory / Totem": "etc",
};

/** Fallback by typeInfo.category alone. */
export const CATEGORY_MAP: Record<string, DesignerCategory> = {
  "One-Handed Weapon": "weapon",
  "Two-Handed Weapon": "weapon",
  // Secondary weapons occupy the shield slot in game.
  "Secondary Weapon": "shield",
  Other: "etc",
  Mount: "etc",
  Monster: "etc",
};

export interface MappingResult {
  category: DesignerCategory;
  mapped: boolean;
}

export function mapCategory(typeInfo: ApiTypeInfo | undefined): MappingResult {
  if (typeInfo) {
    const byPair = PAIR_MAP[`${typeInfo.category} / ${typeInfo.subCategory}`];
    if (byPair) return { category: byPair, mapped: true };
    const byCategory = CATEGORY_MAP[typeInfo.category];
    if (byCategory) return { category: byCategory, mapped: true };
  }
  return { category: "etc", mapped: false };
}
