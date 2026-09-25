/**
 * Random character builder: picks one random item per category, in the designer's
 * category order (skin → … → pendant). "etc" has no equipment slot and is never used.
 */
import type { CharacterEquipment } from "../types/character";
import type { DesignerCategory, MapleItem } from "../types/item";
import { CATEGORY_TO_SLOT } from "./categories";

/** Order in which categories are rolled. */
export const RANDOM_ORDER: DesignerCategory[] = [
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
];

export interface RandomOptions {
  /** Categories to roll; the others keep the current item. */
  include: Record<string, boolean>;
  /** Only pick items whose icon has been downloaded. */
  iconOnly: boolean;
}

export const DEFAULT_RANDOM_OPTIONS: RandomOptions = {
  include: Object.fromEntries(RANDOM_ORDER.map((c) => [c, true])),
  iconOnly: true,
};

export interface RandomResult {
  equipment: CharacterEquipment;
  /** Included categories that had nothing to pick from (kept as before). */
  empty: DesignerCategory[];
}

export async function randomEquipment(
  current: CharacterEquipment,
  options: RandomOptions,
  load: (category: DesignerCategory) => Promise<MapleItem[]>,
  random: () => number = Math.random,
): Promise<RandomResult> {
  const include = (c: DesignerCategory) => !!options.include[c];

  // Overall and top/bottom cannot be worn together: roll which outfit style to use.
  const wantsOverall = include("overall");
  const wantsSeparates = include("top") || include("bottom");
  let useOverall = wantsOverall && !wantsSeparates;
  if (wantsOverall && wantsSeparates) useOverall = random() < 0.5;

  const order = RANDOM_ORDER.filter((c) => {
    if (!include(c)) return false;
    if (c === "overall") return useOverall;
    if (c === "top" || c === "bottom") return !useOverall;
    return true;
  });

  const equipment: CharacterEquipment = { ...current };
  const empty: DesignerCategory[] = [];
  for (const category of order) {
    const slot = CATEGORY_TO_SLOT[category];
    if (!slot) continue;
    let items = await load(category);
    if (options.iconOnly) items = items.filter((i) => i.icon);
    if (!items.length) {
      empty.push(category);
      continue;
    }
    equipment[slot] = items[Math.floor(random() * items.length)].id;
  }

  // Resolve the outfit conflict the same way the equip rules do.
  if (useOverall && equipment.overall && order.includes("overall")) {
    delete equipment.top;
    delete equipment.bottom;
  } else if (!useOverall && (equipment.top || equipment.bottom) && order.some((c) => c === "top" || c === "bottom")) {
    delete equipment.overall;
  }
  return { equipment, empty };
}
