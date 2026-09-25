import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../../lib/mapleApi";
import type { MapleItem } from "../../types/item";

const PAGE_SIZE = 120;

interface Props {
  items: MapleItem[];
  selectedIds: ReadonlySet<number>;
  onItemClick: (item: MapleItem) => void;
  loading?: boolean;
  emptyMessage?: string;
}

/**
 * Thumbnail grid. Renders PAGE_SIZE items at a time and loads the next page when the
 * sentinel scrolls into view; images use native lazy loading.
 */
export default function ItemGrid({ items, selectedIds, onItemClick, loading, emptyMessage }: Props) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);

  // New result set: start from the first page again.
  useEffect(() => setVisible(PAGE_SIZE), [items]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || visible >= items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => Math.min(v + PAGE_SIZE, items.length));
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, items.length]);

  if (loading) return <p className="py-10 text-center text-sm text-slate-500">불러오는 중…</p>;
  if (!items.length) return <p className="py-10 text-center text-sm text-slate-500">{emptyMessage ?? "아이템이 없습니다."}</p>;

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">{items.length.toLocaleString()}개</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {items.slice(0, visible).map((item) => {
          const selected = selectedIds.has(item.id);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onItemClick(item)}
                title={`${item.name} (${item.id})`}
                aria-pressed={selected}
                className={`flex h-full w-full flex-col items-center gap-1 rounded-lg border p-1.5 text-center transition ${
                  selected
                    ? "border-orange-500 bg-orange-50 ring-2 ring-orange-300"
                    : "border-slate-200 bg-white hover:border-orange-300"
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center">
                  {item.icon ? (
                    <img
                      src={assetUrl(item.icon)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="max-h-10 max-w-10 [image-rendering:pixelated]"
                    />
                  ) : (
                    <span className="text-xs text-slate-300">no icon</span>
                  )}
                </span>
                <span className="line-clamp-2 w-full break-all text-[11px] leading-tight text-slate-600">{item.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {visible < items.length && <div ref={sentinel} className="h-8" aria-hidden />}
    </div>
  );
}
