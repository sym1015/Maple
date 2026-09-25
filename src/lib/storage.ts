import type { CharacterEquipment, CharacterFile, CharacterState, EquipmentSlot } from "../types/character";
import { SLOT_TO_CATEGORY } from "./categories";

export const STORAGE_KEY = "maple-character-state";

const SLOTS = Object.keys(SLOT_TO_CATEGORY) as EquipmentSlot[];

/** Keep only known slots with positive integer ids; anything else in the input is dropped. */
export function sanitizeEquipment(input: unknown): CharacterEquipment {
  const equipment: CharacterEquipment = {};
  if (!input || typeof input !== "object") return equipment;
  for (const slot of SLOTS) {
    const value = (input as Record<string, unknown>)[slot];
    if (typeof value === "number" && Number.isInteger(value) && value > 0) equipment[slot] = value;
  }
  return equipment;
}

export function loadState(): CharacterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { equipment: sanitizeEquipment(JSON.parse(raw).equipment) };
  } catch {
    // Storage blocked or corrupt: start fresh.
  }
  return { equipment: {} };
}

export function saveState(state: CharacterState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the in-memory state still works.
  }
}

export function toCharacterFile(state: CharacterState): CharacterFile {
  return { version: 1, equipment: state.equipment };
}

/** Parse an imported character file; throws with a user-facing message when invalid. */
export function parseCharacterFile(text: string): CharacterState {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON 형식이 아닙니다.");
  }
  if (!data || typeof data !== "object" || (data as { version?: unknown }).version !== 1) {
    throw new Error("지원하지 않는 캐릭터 파일입니다 (version 1 필요).");
  }
  return { equipment: sanitizeEquipment((data as CharacterFile).equipment) };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
