/**
 * Builds the same-origin render URL served by scripts/render-proxy.ts.
 *
 * Verified against gms/270:
 *   GET {base}/Character/{skinId}/{itemId,itemId,...}/{action}/{frame} → image/png
 * The API adds the matching head (skinId + 10000) itself and orders every part by the
 * game's zmap, so the client only sends ids.
 */
import type { CharacterEquipment, EquipmentSlot } from "../types/character";

export const DEFAULT_SKIN = 2000;

/** Default action; verified to render for every character. */
export const DEFAULT_ACTION = "stand1";
/** Action names come from GET Character/actions/{items} (see loadActions). */
export type CharacterAction = string;

/** Items sent to the API; body is handled separately as the skin id. */
const ITEM_SLOTS: EquipmentSlot[] = [
  "face",
  "hair",
  "hat",
  "faceAccessory",
  "eyeAccessory",
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

/**
 * The designer's "body" category lists skin heads (API "Character / Head").
 * Render URLs take the body skin id, which is the head id minus 10000.
 */
export function skinIdFor(equipment: CharacterEquipment): number {
  const id = equipment.body;
  if (!id) return DEFAULT_SKIN;
  return id >= 10000 ? id - 10000 : id;
}

/** Equipped item ids in render order (skin excluded). */
export function equipmentItemIds(equipment: CharacterEquipment): number[] {
  return ITEM_SLOTS.map((slot) => equipment[slot]).filter((id): id is number => !!id);
}

export function characterRenderPath(equipment: CharacterEquipment, action: CharacterAction = DEFAULT_ACTION, frame = 0): string {
  return `render/character/${skinIdFor(equipment)}/${equipmentItemIds(equipment).join(",")}/${action}/${frame}.png`;
}

const actionsCache = new Map<string, Promise<string[]>>();

/**
 * Actions the API can render for this equipment (verified: JSON array of names).
 * The API errors when no item is equipped, so that case returns an empty list.
 */
export function loadActions(equipment: CharacterEquipment, resolve: (path: string) => string): Promise<string[]> {
  const ids = equipmentItemIds(equipment);
  if (!ids.length) return Promise.resolve([]);
  const key = ids.join(",");
  let pending = actionsCache.get(key);
  if (!pending) {
    pending = fetch(resolve(`render/actions/${key}.json`)).then(async (res) => {
      if (!res.ok) throw new Error(`동작 목록을 받지 못했습니다 (HTTP ${res.status})`);
      const list: unknown = await res.json();
      if (!Array.isArray(list) || !list.every((a) => typeof a === "string")) throw new Error("동작 목록 형식이 예상과 다릅니다.");
      return list;
    });
    pending.catch(() => actionsCache.delete(key));
    actionsCache.set(key, pending);
  }
  return pending;
}
