import type { SweepData, SweepRow, Agg } from "../lib/data";
import { fmtPct } from "../lib/format";
import { Figure, niceTicks, useTooltip } from "./common";

import { GOLD, SURFACE } from "../lib/palette";

/** One measure per panel (never dual-axis): a line over fleet size with a
 * min–max band across the traffic seeds. */
function Panel({
  rows,
  pick,
  yMax,
  yFmt,
  label,
  refLine,
}: {
  rows: SweepRow[];
  pick: (r: SweepRow) => Agg;
  yMax: number;
  yFmt: (v: number) => string;
  label: string;
  refLine?: { y: number; text: string };
}) {
  const { show, hide, node } = useTooltip();
  const W = 350;
  const H = 230;
  const padL = 46;
  const padB = 30;
  const padT = 20;
  const plotW = W - padL - 12;
  const plotH = H - padT - padB;
  const fleets = rows.map((r) => r.fleet);
  const maxFleet = Math.max(...fleets);
  const xOf = (f: number) => padL + (f / maxFleet) * plotW;
  const ticks = niceTicks(yMax);
  const top = ticks[ticks.length - 1];
  const yOf = (v: number) => padT + plotH - (Math.min(v, top) / top) * plotH;

  const band =
    rows.map((r) => `${xOf(r.fleet)},${yOf(pick(r).max)}`).join(" ") +
    " " +
    [...rows].reverse().map((r) => `${xOf(r.fleet)},${yOf(pick(r).min)}`).join(" ");
  const line = rows.map((r) => `${xOf(r.fleet)},${yOf(pick(r).mean)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ maxWidth: 360 }}>
      <text x={padL} y={12} className="series-label" fill={SURFACE.inkSecondary}>
        {label}
      </text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - 12} y1={yOf(t)} y2={yOf(t)} className="gridline" />
          <text x={padL - 6} y={yOf(t) + 4} textAnchor="end" className="tick-label">
            {yFmt(t)}
          </text>
        </g>
      ))}
      {refLine && refLine.y <= top && (
        <g>
          <line
            x1={padL}
            x2={W - 12}
            y1={yOf(refLine.y)}
            y2={yOf(refLine.y)}
            stroke={SURFACE.inkFaint}
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
          <text x={W - 12} y={yOf(refLine.y) - 5} textAnchor="end" className="tick-label">
            {refLine.text}
          </text>
        </g>
      )}
      <polygon points={band} fill={GOLD} opacity={0.18} />
      <polyline points={line} fill="none" stroke={GOLD} strokeWidth={2.5} strokeLinejoin="round" />
      {rows.map((r) => (
        <circle
          key={r.fleet}
          cx={xOf(r.fleet)}
          cy={yOf(pick(r).mean)}
          r={4.5}
          fill={GOLD}
          stroke={SURFACE.page}
          strokeWidth={2}
          onMouseMove={(e) =>
            show(e, (
              <>
                <b>{r.fleet} cabs</b>
                <div>
                  {label}: {yFmt(pick(r).mean)} (range {yFmt(pick(r).min)}–{yFmt(pick(r).max)})
                </div>
              </>
            ))
          }
          onMouseLeave={hide}
        />
      ))}
      {fleets.map((f) => (
        <text key={f} x={xOf(f)} y={H - 8} textAnchor="middle" className="tick-label">
          {f}
        </text>
      ))}
      <text x={padL + plotW / 2} y={H - 8} dy={0} className="axis-label" textAnchor="middle" dx={0} opacity={0}>
        fleet size
      </text>
      {node}
    </svg>
  );
}

export function SweepChart({ sweep }: { sweep: SweepData }) {
  const rows = sweep.byFleet;
  const maxWait = Math.max(...rows.map((r) => r.waitP50Min.max));
  return (
    <Figure
      title="What it takes to serve one evening hour"
      sub={`fleet size vs outcome · ${sweep.meta.demand} · band = spread over ${sweep.meta.seedsPerFleet} traffic seeds`}
      caption={
        <>
          Shared x-axis: fleet size in the 1% twin — multiply by 100 for the real
          corridor. Dashed line: Austin's typical 10–15 min wait.
        </>
      }
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <Panel
          rows={rows}
          pick={(r) => r.servedShare}
          yMax={1}
          yFmt={(v) => fmtPct(v)}
          label="requests served"
        />
        <Panel
          rows={rows}
          pick={(r) => r.waitP50Min}
          yMax={Math.min(45, maxWait)}
          yFmt={(v) => `${Math.round(v)}m`}
          label="median wait"
          refLine={{ y: 12.5, text: "Austin today" }}
        />
      </div>
    </Figure>
  );
}
