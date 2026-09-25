export interface CharacterEquipment {
  body?: number;
  face?: number;
  hair?: number;

  hat?: number;
  faceAccessory?: number;
  eyeAccessory?: number;
  earrings?: number;

  top?: number;
  bottom?: number;
  overall?: number;

  shoes?: number;
  gloves?: number;
  cape?: number;

  weapon?: number;
  shield?: number;

  ring?: number;
  medal?: number;
  pendant?: number;
}

export type EquipmentSlot = keyof CharacterEquipment;

export interface CharacterState {
  equipment: CharacterEquipment;
}

/** Shape of an exported / saved character file. */
export interface CharacterFile {
  version: 1;
  equipment: CharacterEquipment;
}
