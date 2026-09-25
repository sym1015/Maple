import { useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Search input; reports changes after a short pause so large lists are not re-filtered on every key. */
export default function SearchBar({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 200);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);

  return (
    <div className="relative">
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder ?? "아이템 이름 또는 ID 검색"}
        aria-label="아이템 검색"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
      />
    </div>
  );
}
