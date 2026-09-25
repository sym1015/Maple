import { CATEGORY_LABELS } from "../../lib/categories";
import type { CategorySummary, DesignerCategory } from "../../types/item";

interface Props {
  categories: CategorySummary[];
  selected: DesignerCategory;
  onSelect: (category: DesignerCategory) => void;
}

/** Vertical list on desktop, horizontal scroll strip on mobile. */
export default function CategoryList({ categories, selected, onSelect }: Props) {
  return (
    <nav aria-label="카테고리" className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
      {categories.map(({ id, count }) => {
        const active = id === selected;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? "true" : undefined}
            className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
              active ? "bg-orange-500 font-semibold text-white" : "bg-white text-slate-700 hover:bg-orange-50"
            }`}
          >
            <span>{CATEGORY_LABELS[id]}</span>
            <span className={`text-xs tabular-nums ${active ? "text-orange-100" : "text-slate-400"}`}>
              {count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
