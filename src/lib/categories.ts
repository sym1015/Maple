import type { EquipmentSlot } from "../types/character";
import type { DesignerCategory } from "../types/item";

export const CATEGORY_LABELS: Record<DesignerCategory, string> = {
  body: "피부",
  face: "얼굴",
  hair: "헤어",
  hat: "모자",
  "face-accessory": "얼굴장식",
  "eye-accessory": "눈장식",
  earrings: "귀고리",
  top: "상의",
  bottom: "하의",
  overall: "한벌옷",
  shoes: "신발",
  gloves: "장갑",
  cape: "망토",
  weapon: "무기",
  shield: "보조무기",
  ring: "반지",
  medal: "훈장",
  pendant: "펜던트",
  etc: "기타",
};

/** Which equipment slot an item of each category occupies. "etc" items are browse-only. */
export const CATEGORY_TO_SLOT: Record<DesignerCategory, EquipmentSlot | undefined> = {
  body: "body",
  face: "face",
  hair: "hair",
  hat: "hat",
  "face-accessory": "faceAccessory",
  "eye-accessory": "eyeAccessory",
  earrings: "earrings",
  top: "top",
  bottom: "bottom",
  overall: "overall",
  shoes: "shoes",
  gloves: "gloves",
  cape: "cape",
  weapon: "weapon",
  shield: "shield",
  ring: "ring",
  medal: "medal",
  pendant: "pendant",
  etc: undefined,
};

export const SLOT_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_TO_SLOT)
    .filter(([, slot]) => slot)
    .map(([category, slot]) => [slot, category]),
) as Record<EquipmentSlot, DesignerCategory>;
