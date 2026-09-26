import { useEffect, useMemo, useRef, useState } from "react";
import { actionLabel } from "../../lib/actionLabels";
import { downloadBlob } from "../../lib/storage";
import { buildZip, runExport, type AnimationProgress, type ExportResult } from "../../lib/sprite/exporter";
import type { AnchorMode } from "../../lib/sprite/frames";
import { DEFAULT_SHEET_SETTINGS, canvasToPng, type SheetSettings } from "../../lib/sprite/sheet";
import type { CharacterEquipment } from "../../types/character";
import AnimationPlayer from "./AnimationPlayer";

interface Props {
  equipment: CharacterEquipment;
  /** Actions reported by the API for this equipment. */
  actions: string[];
}

const ANCHORS: { id: AnchorMode; label: string }[] = [
  { id: "topLeft", label: "왼쪽 위" },
  { id: "center", label: "가운데" },
  { id: "feet", label: "발" },
  { id: "navel", label: "배꼽" },
];

const CHECKER =
  "bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%),linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-600">
      {label}
      {children}
    </label>
  );
}

const inputCls = "rounded border border-slate-300 bg-white px-2 py-1 text-sm";

function optionalNumber(value: string): number | null {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : Math.floor(n);
}

function CanvasView({ canvas, className, style }: { canvas: HTMLCanvasElement; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = canvas.width;
    c.height = canvas.height;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0);
  }, [canvas]);
  return <canvas ref={ref} className={`[image-rendering:pixelated] ${className ?? ""}`} style={style} />;
}

export default function SpriteExporter({ equipment, actions }: Props) {
  const [settings, setSettings] = useState<SheetSettings>(DEFAULT_SHEET_SETTINGS);
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<AnimationProgress[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<HTMLCanvasElement | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Keep the selection valid for the current equipment; default to stand1 when available.
  useEffect(() => {
    setSelected((prev) => {
      const kept = prev.filter((a) => actions.includes(a));
      if (kept.length) return kept;
      return actions.includes("stand1") ? ["stand1"] : actions.slice(0, 1);
    });
  }, [actions]);

  // A different character invalidates earlier results.
  useEffect(() => setResult(null), [equipment]);

  const set = <K extends keyof SheetSettings>(key: K, value: SheetSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));

  const start = async (animations: string[]) => {
    if (!animations.length) return;
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await runExport(equipment, animations, settings, { signal: ctl.signal, onProgress: setProgress });
      if (!ctl.signal.aborted) setResult(r);
    } catch (e) {
      if (!ctl.signal.aborted) setError((e as Error).message);
    } finally {
      if (controller.current === ctl) {
        controller.current = null;
        setRunning(false);
      }
    }
  };

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setRunning(false);
    setProgress([]);
    setError("취소했습니다. 만들던 결과는 저장하지 않았습니다.");
  };

  const downloadZip = async () => {
    if (!result) return;
    try {
      downloadBlob(await buildZip(result, settings, equipment), "CharacterSpriteSheet.zip");
    } catch (e) {
      setError(`ZIP 만들기 실패: ${(e as Error).message}`);
    }
  };

  const overall = useMemo(() => {
    if (!progress.length) return 0;
    const done = progress.filter((p) => p.status === "done" || p.status === "skipped").length;
    const partial = progress.find((p) => p.status === "loading");
    return Math.round(((done + (partial ? 0.5 : 0)) / progress.length) * 100);
  }, [progress]);

  const noItems = actions.length === 0;

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-slate-50 p-4" aria-label="스프라이트 시트 내보내기">
      <h2 className="text-sm font-semibold text-slate-700">스프라이트 시트 내보내기</h2>
      {noItems ? (
        <p className="text-sm text-slate-500">아이템을 하나 이상 착용하면 동작 목록을 불러와 내보낼 수 있습니다.</p>
      ) : (
        <>
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-600">
              <span>동작 ({selected.length}/{actions.length})</span>
              <button type="button" className="underline" onClick={() => setSelected(actions)}>
                전체 선택
              </button>
              <button type="button" className="underline" onClick={() => setSelected([])}>
                전체 해제
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {actions.map((a) => (
                <label key={a} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    data-action={a}
                    checked={selected.includes(a)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a] : s.filter((x) => x !== a)))}
                  />
                  {actionLabel(a)}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="확대">
              <select className={inputCls} value={settings.zoom} onChange={(e) => set("zoom", Number(e.target.value))}>
                {[1, 2, 4, 8].map((z) => (
                  <option key={z} value={z}>
                    {z}배
                  </option>
                ))}
              </select>
            </Field>
            <Field label="FPS">
              <input
                className={inputCls}
                type="number"
                min={1}
                max={60}
                value={settings.fps}
                onChange={(e) => set("fps", Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
              />
            </Field>
            <Field label="열 수">
              <input
                className={inputCls}
                type="number"
                min={1}
                value={settings.columns}
                onChange={(e) => set("columns", Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              />
            </Field>
            <Field label="행 수 (비우면 자동)">
              <input className={inputCls} type="number" min={1} placeholder="자동" value={settings.rows ?? ""} onChange={(e) => set("rows", optionalNumber(e.target.value))} />
            </Field>
            <Field label="프레임 가로 (비우면 자동)">
              <input
                className={inputCls}
                type="number"
                min={1}
                placeholder="자동"
                value={settings.frameWidth ?? ""}
                onChange={(e) => set("frameWidth", optionalNumber(e.target.value))}
              />
            </Field>
            <Field label="프레임 세로 (비우면 자동)">
              <input
                className={inputCls}
                type="number"
                min={1}
                placeholder="자동"
                value={settings.frameHeight ?? ""}
                onChange={(e) => set("frameHeight", optionalNumber(e.target.value))}
              />
            </Field>
            <Field label="여백 (px)">
              <input
                className={inputCls}
                type="number"
                min={0}
                value={settings.padding}
                onChange={(e) => set("padding", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
            </Field>
            <div className="flex flex-col gap-1 text-xs text-slate-600">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={settings.flip} onChange={(e) => set("flip", e.target.checked)} />
                좌우 반전
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={settings.transparent} onChange={(e) => set("transparent", e.target.checked)} />
                투명 배경
              </label>
              {!settings.transparent && (
                <input type="color" aria-label="배경색" value={settings.background} onChange={(e) => set("background", e.target.value)} />
              )}
            </div>
          </div>

          <fieldset className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <legend className="mb-1">기준점</legend>
            {ANCHORS.map((a) => (
              <label key={a.id} className="flex items-center gap-1">
                <input type="radio" name="anchor" checked={settings.anchor === a.id} onChange={() => set("anchor", a.id)} />
                {a.label}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running || !selected.length}
              onClick={() => start(actions.filter((a) => selected.includes(a)))}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              최소: 선택한 동작 만들기
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => start(actions)}
              className="rounded-lg border border-orange-400 bg-white px-3 py-1.5 text-sm text-orange-600 disabled:opacity-40"
            >
              전체: 모든 동작 만들기 ({actions.length}개)
            </button>
            {running && (
              <button type="button" onClick={cancel} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600">
                취소
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {progress.length > 0 && (running || result) && (
        <div className="flex flex-col gap-2" aria-label="진행 상황">
          {progress.map((p) => {
            const pct = p.status === "done" || p.status === "skipped" ? 100 : p.status === "loading" ? Math.min(95, p.loadedFrames * 10) : 0;
            return (
              <div key={p.animation} className="text-xs text-slate-600">
                <div className="flex justify-between">
                  <span className="font-medium">{actionLabel(p.animation)}</span>
                  <span>
                    {p.status === "waiting" && "대기"}
                    {p.status === "loading" && `프레임 ${p.loadedFrames}장 받음`}
                    {p.status === "done" && `완료 (프레임 ${p.frameCount}장)`}
                    {p.status === "skipped" && "건너뜀"}
                    {p.retry && ` · ${p.retry.frame}번 프레임 재시도 ${p.retry.attempt}/${p.retry.max}`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-200">
                  <div className={`h-full ${p.status === "skipped" ? "bg-red-300" : "bg-orange-400"}`} style={{ width: `${pct}%` }} />
                </div>
                {p.message && <p className="mt-0.5 text-[11px] text-slate-500">{p.message}</p>}
              </div>
            );
          })}
          <div className="text-xs font-medium text-slate-700">
            전체 {overall}%
            <div className="h-2 overflow-hidden rounded bg-slate-200">
              <div className="h-full bg-slate-600" style={{ width: `${overall}%` }} />
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={downloadZip} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white">
              ZIP 받기 (CharacterSpriteSheet.zip)
            </button>
            <span className="text-xs text-slate-500">
              캐릭터 해시 {result.characterHash} · 완료 {result.results.length}개
              {result.skipped.length > 0 && ` · 건너뜀 ${result.skipped.length}개`}
            </span>
          </div>
          {result.failedFrames.length > 0 && (
            <pre className="overflow-auto rounded bg-red-50 p-2 text-[11px] text-red-700">
              {JSON.stringify({ failedFrames: result.failedFrames }, null, 2)}
            </pre>
          )}

          {result.results.map((r) => (
            <article key={r.animation} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700" data-action={r.animation}>
                  {actionLabel(r.animation)} · 프레임 {r.frames.length}장 · 칸 {r.sheet.cell.width}×{r.sheet.cell.height}px
                  <span className="ml-2 text-xs font-normal text-slate-400">파일 이름: {r.animation}</span>
                </h3>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1"
                    onClick={async () => downloadBlob(await canvasToPng(r.sheet.canvas), `${r.animation}_spritesheet.png`)}
                  >
                    PNG 받기
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1"
                    onClick={() =>
                      downloadBlob(new Blob([JSON.stringify(r.sheet.metadata, null, 2)], { type: "application/json" }), `${r.animation}.json`)
                    }
                  >
                    JSON 받기
                  </button>
                </div>
              </header>

              <div>
                <p className="mb-1 text-xs text-slate-500">프레임 (누르면 크게 보기)</p>
                <div className="flex flex-wrap gap-1">
                  {r.sheet.frameCanvases.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      title={`${r.animation}_${i}.png`}
                      onClick={() => setZoomed(c)}
                      className={`flex flex-col items-center rounded border border-slate-200 p-1 ${CHECKER}`}
                    >
                      <CanvasView canvas={c} style={{ height: 64 }} />
                      <span className="text-[10px] text-slate-500">{i}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">
                  스프라이트 시트 ({r.sheet.canvas.width}×{r.sheet.canvas.height}px, {r.sheet.metadata.columns}열 × {r.sheet.metadata.rows}행)
                </p>
                <div className={`max-h-80 overflow-auto rounded border border-slate-200 ${CHECKER}`}>
                  <CanvasView canvas={r.sheet.canvas} className="block max-w-none" />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs text-slate-500">시트로 재생해 보기</p>
                <AnimationPlayer frames={r.sheet.frameCanvases} initialFps={settings.fps} label={`${actionLabel(r.animation)} 재생`} />
              </div>
            </article>
          ))}
        </div>
      )}

      {zoomed && (
        <div
          role="dialog"
          aria-label="프레임 크게 보기"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setZoomed(null)}
        >
          <div className={`max-h-full max-w-full overflow-auto rounded-lg p-4 ${CHECKER}`}>
            <CanvasView canvas={zoomed} style={{ width: zoomed.width * 2 }} />
          </div>
        </div>
      )}
    </section>
  );
}
