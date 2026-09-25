import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCharacter } from "../../hooks/useCharacter";
import { CATEGORY_LABELS, SLOT_TO_CATEGORY } from "../../lib/categories";
import { characterRenderPath, DEFAULT_ACTION, loadActions, type CharacterAction } from "../../lib/characterRender";
import { assetUrl, loadCategories, loadCategoryItems } from "../../lib/mapleApi";
import { exportPNG } from "../../lib/renderer";
import { downloadBlob, parseCharacterFile, sanitizeEquipment, toCharacterFile } from "../../lib/storage";
import type { EquipmentSlot } from "../../types/character";
import type { CategorySummary, DesignerCategory, MapleItem } from "../../types/item";
import CategoryList from "../CategoryList/CategoryList";
import CharacterPreview from "../CharacterPreview/CharacterPreview";
import ItemGrid from "../ItemGrid/ItemGrid";
import SearchBar from "../SearchBar/SearchBar";
import SpriteExporter from "../SpriteExporter/SpriteExporter";

const SAVED_KEY = "maple-character-saved";

function matches(item: MapleItem, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return item.name.toLowerCase().includes(q) || String(item.id).includes(q);
}

function ToolbarButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-orange-400 hover:text-orange-600 disabled:opacity-40"
    />
  );
}

export default function CharacterDesigner() {
  const { state, unequip, toggleItem, reset, replace } = useCharacter();

  const [categories, setCategories] = useState<CategorySummary[] | null | undefined>(undefined);
  const [category, setCategory] = useState<DesignerCategory>("hair");
  const [items, setItems] = useState<MapleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [action, setAction] = useState<CharacterAction>(DEFAULT_ACTION);
  const [actions, setActions] = useState<string[]>([]);
  const [pngScale, setPngScale] = useState(2);
  const [showSprites, setShowSprites] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCategories()
      .then((list) => {
        const available = list?.filter((c) => c.count > 0) ?? null;
        setCategories(available);
        if (available?.length && !available.some((c) => c.id === "hair")) setCategory(available[0].id);
      })
      .catch((e: Error) => {
        setCategories(null);
        setError(e.message);
      });
  }, []);

  // Load the selected category's items on demand.
  useEffect(() => {
    if (!categories) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadCategoryItems(category)
      .then((list) => !cancelled && setItems(list))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [categories, category]);

  // Resolve names of equipped items (loads only the categories that are equipped).
  useEffect(() => {
    const slots = Object.keys(state.equipment) as EquipmentSlot[];
    Promise.all(slots.map((slot) => loadCategoryItems(SLOT_TO_CATEGORY[slot]).catch(() => [])))
      .then((lists) => {
        const map = new Map<number, string>();
        const wanted = new Set(Object.values(state.equipment));
        for (const list of lists) for (const item of list) if (wanted.has(item.id)) map.set(item.id, item.name);
        setNames(map);
      })
      .catch(() => {});
  }, [state.equipment]);

  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Action list depends on the equipment (e.g. weapon type); fall back to stand1 when the
  // current action is no longer available.
  useEffect(() => {
    if (!categories) return;
    let cancelled = false;
    loadActions(state.equipment, assetUrl)
      .then((list) => {
        if (cancelled) return;
        setActions(list);
        setAction((current) => (list.length === 0 || list.includes(current) ? current : DEFAULT_ACTION));
      })
      .catch(() => !cancelled && setActions([]));
    return () => {
      cancelled = true;
    };
  }, [categories, state.equipment]);

  const flash = useCallback((message: string) => {
    // Restart the timer so an earlier notice's timeout cannot hide this one early.
    clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 2500);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Items whose icon has been collected come first; the rest are still equippable.
  const filtered = useMemo(() => {
    const hits = items.filter((item) => matches(item, query));
    return [...hits.filter((i) => i.icon), ...hits.filter((i) => !i.icon)];
  }, [items, query]);
  const selectedIds = useMemo(() => new Set(Object.values(state.equipment) as number[]), [state.equipment]);

  const saveCharacter = () => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(toCharacterFile(state)));
      flash("캐릭터를 저장했습니다.");
    } catch {
      flash("브라우저 저장소에 저장하지 못했습니다.");
    }
  };

  const loadCharacter = () => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (!raw) return flash("저장된 캐릭터가 없습니다.");
      replace({ equipment: sanitizeEquipment(JSON.parse(raw).equipment) });
      flash("저장된 캐릭터를 불러왔습니다.");
    } catch {
      flash("저장된 캐릭터를 읽지 못했습니다.");
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(toCharacterFile(state), null, 2)], { type: "application/json" });
    downloadBlob(blob, "maple-character.json");
  };

  const importJson = async (file: File) => {
    try {
      replace(parseCharacterFile(await file.text()));
      flash("캐릭터 파일을 불러왔습니다.");
    } catch (e) {
      flash(`불러오기 실패: ${(e as Error).message}`);
    }
  };

  const renderPath = categories ? characterRenderPath(state.equipment, action) : null;

  const savePng = async () => {
    if (!renderPath) return;
    try {
      const blob = await exportPNG([{ key: "character", src: assetUrl(renderPath), x: 0, y: 0, order: 0 }], {
        padding: 0,
        scale: pngScale,
      });
      downloadBlob(blob, `maple-character-${pngScale}x.png`);
    } catch (e) {
      flash(`PNG 저장 실패: ${(e as Error).message}`);
    }
  };

  const confirmReset = () => {
    if (Object.keys(state.equipment).length === 0 || window.confirm("착용한 아이템을 모두 해제할까요?")) reset();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Maple Character Designer</h1>
        <div className="flex flex-wrap gap-2">
          <ToolbarButton onClick={confirmReset}>초기화</ToolbarButton>
          <ToolbarButton onClick={saveCharacter}>저장</ToolbarButton>
          <ToolbarButton onClick={loadCharacter}>불러오기</ToolbarButton>
          <ToolbarButton onClick={exportJson}>JSON 내보내기</ToolbarButton>
          <ToolbarButton onClick={() => fileInput.current?.click()}>JSON 가져오기</ToolbarButton>
          <span className="flex items-stretch">
            <ToolbarButton onClick={savePng} disabled={!renderPath}>
              PNG 저장
            </ToolbarButton>
            <select
              aria-label="PNG 배율"
              value={pngScale}
              onChange={(e) => setPngScale(Number(e.target.value))}
              className="ml-1 rounded-lg border border-slate-300 bg-white px-1 text-sm"
            >
              {[1, 2, 4].map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </span>
          <ToolbarButton onClick={() => setShowSprites((v) => !v)} disabled={!renderPath} aria-expanded={showSprites}>
            스프라이트 시트
          </ToolbarButton>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importJson(file);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      {notice && (
        <p role="status" className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white">
          {notice}
        </p>
      )}

      {categories === null ? (
        <div className="rounded-xl bg-white p-6 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">아이템 데이터가 없습니다.</p>
          <p className="mt-2">
            터미널에서 <code className="rounded bg-slate-100 px-1">npm run assets:collect</code> 를 실행해 에셋을 먼저
            수집하세요. 자세한 방법은 README를 참고하세요.
          </p>
          {error && <p className="mt-2 text-red-600">{error}</p>}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 md:grid md:grid-cols-[12rem_1fr]">
            <div className="order-2 md:order-1">
              {categories && <CategoryList categories={categories} selected={category} onSelect={setCategory} />}
            </div>
            <div className="order-1 rounded-xl bg-slate-50 p-4 md:order-2">
              <CharacterPreview
                equipment={state.equipment}
                names={names}
                onRemove={unequip}
                renderPath={renderPath}
                action={action}
                actions={actions}
                onActionChange={setAction}
              />
            </div>
          </div>

          {showSprites && <SpriteExporter equipment={state.equipment} actions={actions} />}

          <section className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <h2 className="shrink-0 text-sm font-semibold text-slate-700">{CATEGORY_LABELS[category]}</h2>
              <div className="flex-1">
                <SearchBar value={query} onChange={setQuery} />
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <ItemGrid
              items={filtered}
              selectedIds={selectedIds}
              onItemClick={toggleItem}
              loading={loading || categories === undefined}
              emptyMessage={query ? "검색 결과가 없습니다." : undefined}
            />
          </section>
        </>
      )}
    </div>
  );
}
