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

/** Action names taken from the frameBooks of real items (stand1 verified for rendering). */
export const ACTIONS = ["stand1", "stand2", "walk1", "alert", "sit", "jump", "prone", "fly", "ladder", "rope"] as const;
export type CharacterAction = (typeof ACTIONS)[number];

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

export function characterRenderPath(equipment: CharacterEquipment, action: CharacterAction = "stand1", frame = 0): string {
  const items = ITEM_SLOTS.map((slot) => equipment[slot]).filter((id): id is number => !!id);
  return `render/character/${skinIdFor(equipment)}/${items.join(",")}/${action}/${frame}.png`;
}
