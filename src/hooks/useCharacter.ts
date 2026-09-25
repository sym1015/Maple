import { useCallback, useEffect, useState } from "react";
import { CATEGORY_TO_SLOT } from "../lib/categories";
import { loadState, saveState } from "../lib/storage";
import type { CharacterState, EquipmentSlot } from "../types/character";
import type { MapleItem } from "../types/item";

/** Slots that cannot be worn together with the given slot. */
const CONFLICTS: Partial<Record<EquipmentSlot, EquipmentSlot[]>> = {
  overall: ["top", "bottom"],
  top: ["overall"],
  bottom: ["overall"],
};

export function useCharacter() {
  const [state, setState] = useState<CharacterState>(loadState);

  useEffect(() => saveState(state), [state]);

  const equip = useCallback((slot: EquipmentSlot, id: number) => {
    setState((prev) => {
      const equipment = { ...prev.equipment, [slot]: id };
      for (const other of CONFLICTS[slot] ?? []) delete equipment[other];
      return { equipment };
    });
  }, []);

  const unequip = useCallback((slot: EquipmentSlot) => {
    setState((prev) => {
      const equipment = { ...prev.equipment };
      delete equipment[slot];
      return { equipment };
    });
  }, []);

  /** Click behaviour of the item grid: equip, or unequip when the same item is clicked again. */
  const toggleItem = useCallback(
    (item: MapleItem) => {
      const slot = CATEGORY_TO_SLOT[item.category];
      if (!slot) return;
      if (state.equipment[slot] === item.id) unequip(slot);
      else equip(slot, item.id);
    },
    [state.equipment, equip, unequip],
  );

  const reset = useCallback(() => setState({ equipment: {} }), []);
  const replace = useCallback((next: CharacterState) => setState(next), []);

  return { state, equip, unequip, toggleItem, reset, replace };
}
