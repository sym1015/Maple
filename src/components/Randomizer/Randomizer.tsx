import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABELS } from "../../lib/categories";
import { loadCategoryItems } from "../../lib/mapleApi";
import { DEFAULT_RANDOM_OPTIONS, RANDOM_ORDER, randomEquipment, type RandomOptions } from "../../lib/randomCharacter";
import type { CharacterEquipment } from "../../types/character";

const SETTINGS_KEY = "maple-random-settings";
const HISTORY_LIMIT = 20;

function loadOptions(): RandomOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<RandomOptions> | null;
    if (saved && typeof saved === "object") {
      return {
        iconOnly: saved.iconOnly ?? DEFAULT_RANDOM_OPTIONS.iconOnly,
        include: { ...DEFAULT_RANDOM_OPTIONS.include, ...(saved.include ?? {}) },
      };
    }
  } catch {
    // Corrupt or blocked storage: use defaults.
  }
  return DEFAULT_RANDOM_OPTIONS;
}

interface Props {
  equipment: CharacterEquipment;
  onApply: (equipment: CharacterEquipment) => void;
  onMessage: (message: string) => void;
  disabled?: boolean;
}

const btn =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-orange-400 hover:text-orange-600 disabled:opacity-40";

/** "Random" toolbar group: roll a character, settings popover, undo history. */
export default function Randomizer({ equipment, onApply, onMessage, disabled }: Props) {
  const [options, setOptions] = useState<RandomOptions>(loadOptions);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<CharacterEquipment[]>([]);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(options));
    } catch {
      // Not critical.
    }
  }, [options]);

  // Close the settings popover when clicking elsewhere.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const roll = async () => {
    if (!RANDOM_ORDER.some((c) => options.include[c])) {
      onMessage("랜덤에 포함할 카테고리를 하나 이상 켜 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { equipment: next, empty } = await randomEquipment(equipment, options, loadCategoryItems);
      setHistory((h) => [...h, equipment].slice(-HISTORY_LIMIT));
      onApply(next);
      if (empty.length) {
        const names = empty.map((c) => CATEGORY_LABELS[c]).join(", ");
        onMessage(
          `${names}: ${options.iconOnly ? "아이콘을 받은 아이템이 없어" : "아이템이 없어"} 그대로 두었습니다.`,
        );
      }
    } catch (e) {
      onMessage(`랜덤 조합 실패: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    onApply(previous);
  };

  const setAll = (value: boolean) => setOptions((o) => ({ ...o, include: Object.fromEntries(RANDOM_ORDER.map((c) => [c, value])) }));

  return (
    <span className="relative flex items-stretch gap-1" ref={panel}>
      <button type="button" className={btn} onClick={roll} disabled={disabled || busy}>
        {busy ? "고르는 중…" : "🎲 랜덤 조합"}
      </button>
      <button type="button" className={btn} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="랜덤 조합 설정">
        ⚙
      </button>
      <button type="button" className={btn} onClick={undo} disabled={!history.length} title="랜덤 조합 전 캐릭터로 되돌리기">
        되돌리기
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="랜덤 조합 설정"
          className="absolute top-full right-0 z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg"
        >
          <p className="mb-2 text-xs text-slate-500">체크한 카테고리만 순서대로 하나씩 무작위로 고릅니다. 체크를 뺀 카테고리는 지금 것을 그대로 둡니다.</p>
          <div className="mb-2 flex gap-2 text-xs">
            <button type="button" className="underline" onClick={() => setAll(true)}>
              모두 선택
            </button>
            <button type="button" className="underline" onClick={() => setAll(false)}>
              모두 해제
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {RANDOM_ORDER.map((c) => (
              <label key={c} className="flex items-center gap-1 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={!!options.include[c]}
                  onChange={(e) => setOptions((o) => ({ ...o, include: { ...o.include, [c]: e.target.checked } }))}
                />
                {CATEGORY_LABELS[c]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">한벌옷과 상의·하의는 함께 입을 수 없어서 둘 중 하나를 반반 확률로 고릅니다.</p>
          <label className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2 text-xs text-slate-700">
            <input type="checkbox" checked={options.iconOnly} onChange={(e) => setOptions((o) => ({ ...o, iconOnly: e.target.checked }))} />
            아이콘을 받은 아이템만 사용
          </label>
        </div>
      )}
    </span>
  );
}
