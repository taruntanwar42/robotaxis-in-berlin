import { useCallback, useState, type ReactNode } from "react";

import { GRID_TEXT } from "../lib/palette";

export const INK_FAINT = GRID_TEXT;

export function niceTicks(max: number, count = 4): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

export interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Shared hover tooltip: charts report viewport coords, we render one box. */
export function useTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const show = useCallback((e: { clientX: number; clientY: number }, content: ReactNode) => {
    setTip({ x: e.clientX, y: e.clientY, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const node = tip ? (
    <div
      className="chart-tooltip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 200),
        top: tip.y + 14,
      }}
    >
      {tip.content}
    </div>
  ) : null;
  return { show, hide, node };
}

export function Figure({
  title,
  sub,
  children,
  caption,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <figure className="chart">
      <div className="chart-title">{title}</div>
      {sub && <div className="chart-sub">{sub}</div>}
      {children}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
