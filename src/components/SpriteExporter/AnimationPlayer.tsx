import { useEffect, useRef, useState } from "react";

interface Props {
  /** Equal-sized frame canvases (cells). */
  frames: HTMLCanvasElement[];
  initialFps?: number;
  /** Display scale on top of the canvas pixels (CSS only; exports use real pixels). */
  displayScale?: number;
  label?: string;
}

const CHECKER =
  "bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%),linear-gradient(45deg,#e2e8f0_25%,transparent_25%,transparent_75%,#e2e8f0_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] bg-white";

/** Plays frame canvases like the game would: Play / Pause / Restart, FPS, loop, frame counter. */
export default function AnimationPlayer({ frames, initialFps = 12, displayScale = 1, label = "애니메이션" }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(initialFps);
  const [loop, setLoop] = useState(true);

  useEffect(() => {
    setFrame(0);
    setPlaying(true);
  }, [frames]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setInterval(() => {
      setFrame((f) => {
        if (f + 1 < frames.length) return f + 1;
        if (loop) return 0;
        setPlaying(false);
        return f;
      });
    }, 1000 / Math.max(1, fps));
    return () => clearInterval(t);
  }, [playing, fps, loop, frames.length]);

  useEffect(() => {
    const c = canvas.current;
    const src = frames[frame];
    if (!c || !src) return;
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0);
  }, [frame, frames]);

  if (!frames.length) return null;
  const w = frames[0].width * displayScale;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`max-w-full overflow-auto rounded-lg p-2 ${CHECKER}`}>
        <canvas ref={canvas} aria-label={label} className="block [image-rendering:pixelated]" style={{ width: w }} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
        <button type="button" onClick={() => setPlaying((p) => !p)} className="rounded border border-slate-300 bg-white px-2 py-1">
          {playing ? "⏸ 일시정지" : "▶ 재생"}
        </button>
        <button
          type="button"
          onClick={() => {
            setFrame(0);
            setPlaying(true);
          }}
          className="rounded border border-slate-300 bg-white px-2 py-1"
        >
          ⟲ 처음부터
        </button>
        <label className="flex items-center gap-1">
          FPS
          <input
            type="number"
            min={1}
            max={60}
            value={fps}
            onChange={(e) => setFps(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
            className="w-14 rounded border border-slate-300 px-1 py-0.5"
          />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          반복
        </label>
        <span className="tabular-nums">
          프레임 {frame + 1} / {frames.length}
        </span>
      </div>
    </div>
  );
}
