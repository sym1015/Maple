import { useEffect, useState } from "react";
import { CATEGORY_LABELS, SLOT_TO_CATEGORY } from "../../lib/categories";
import { ACTIONS, type CharacterAction } from "../../lib/characterRender";
import { assetUrl } from "../../lib/mapleApi";
import type { CharacterEquipment, EquipmentSlot } from "../../types/character";

interface Props {
  equipment: CharacterEquipment;
  /** Names of equipped items, when their category data has been loaded. */
  names: ReadonlyMap<number, string>;
  onRemove: (slot: EquipmentSlot) => void;
  /** Same-origin render path (lib/characterRender.ts), or null when rendering is unavailable. */
  renderPath: string | null;
  action: CharacterAction;
  onActionChange: (action: CharacterAction) => void;
}

/** Wait until the path stops changing so fast clicking does not fire a request per click. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Simple original mannequin shown while the character render is unavailable. */
function Mannequin() {
  return (
    <svg viewBox="0 0 80 120" className="h-48 w-32" aria-hidden>
      <g fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2">
        <circle cx="40" cy="26" r="16" />
        <rect x="26" y="44" width="28" height="36" rx="8" />
        <rect x="14" y="48" width="10" height="28" rx="5" />
        <rect x="56" y="48" width="10" height="28" rx="5" />
        <rect x="28" y="80" width="10" height="30" rx="5" />
        <rect x="42" y="80" width="10" height="30" rx="5" />
      </g>
    </svg>
  );
}

export default function CharacterPreview({ equipment, names, onRemove, renderPath, action, onActionChange }: Props) {
  const slots = (Object.keys(equipment) as EquipmentSlot[]).filter((s) => equipment[s]);
  const path = useDebounced(renderPath, 300);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [shown, setShown] = useState<string | null>(null);

  // Keep showing the previous image until the new one has loaded.
  useEffect(() => {
    if (!path) {
      setStatus("idle");
      setShown(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setShown(img.src);
      setStatus("ok");
    };
    img.onerror = () => !cancelled && setStatus("error");
    img.src = assetUrl(path);
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex h-64 w-full items-center justify-center rounded-xl bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%),linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-white">
        {shown ? (
          <img
            src={shown}
            alt="캐릭터 미리보기"
            className={`max-h-60 [image-rendering:pixelated] ${status === "loading" ? "opacity-60" : ""}`}
            style={{ zoom: 2 }}
          />
        ) : (
          <Mannequin />
        )}
        {status === "loading" && <span className="absolute top-2 right-3 text-xs text-slate-500">그리는 중…</span>}
        {status === "error" && (
          <span role="alert" className="absolute inset-x-3 bottom-2 rounded bg-red-50 px-2 py-1 text-center text-xs text-red-600">
            캐릭터를 그리지 못했습니다. 개발 서버(npm run dev)와 인터넷 연결을 확인하세요.
          </span>
        )}
        <label className="absolute top-2 left-3 flex items-center gap-1 text-xs text-slate-500">
          동작
          <select
            value={action}
            onChange={(e) => onActionChange(e.target.value as CharacterAction)}
            className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="w-full">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">착용 중 ({slots.length})</h2>
        {slots.length === 0 ? (
          <p className="text-sm text-slate-400">아래 목록에서 아이템을 눌러 착용하세요.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {slots.map((slot) => {
              const id = equipment[slot]!;
              return (
                <li key={slot} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-xs text-slate-400">{CATEGORY_LABELS[SLOT_TO_CATEGORY[slot]]}</span>
                    {names.get(id) ?? id}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(slot)}
                    className="shrink-0 rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    해제
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
