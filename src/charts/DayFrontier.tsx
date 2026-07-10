import type { DayFrontier } from "../lib/data";
import { Figure, useTooltip } from "./common";
import { GOLD, SURFACE } from "../lib/palette";

/** The operator's dial: each point is one complete simulated day.
 * x = days until a cab pays for itself, y = median rider wait. */
export function DayFrontierChart({ frontier }: { frontier: DayFrontier }) {
  const { show, hide, node } = useTooltip();
  const rows = frontier.byFleet.filter((r) => r.paybackDays !== null);
  const W = 720;
  const H = 300;
  const padL = 52;
  const padB = 40;
  const padT = 16;
  const padR = 30;
  const maxX = Math.max(...rows.map((r) => r.paybackDays!)) * 1.15;
  const maxY = Math.max(...rows.map((r) => r.waitP50Min)) * 1.15;
  const xOf = (v: number) => padL + (v / maxX) * (W - padL - padR);
  const yOf = (v: number) => padT + (H - padT - padB) * (1 - v / maxY);
  const sorted = [...rows].sort((a, b) => a.fleet - b.fleet);
  const line = sorted.map((r) => `${xOf(r.paybackDays!)},${yOf(r.waitP50Min)}`).join(" ");

  return (
    <Figure
      title="The operator's dial, measured"
      sub="each point = one complete simulated day (04:00–04:00) · same 1,828 requests, different fleet size"
      caption="Down-left is better for riders, slower for the operator. Caveat on the tempting left end: below ~24 cabs each cab drives more than one 48 kWh battery per day (fleet 12: 513 km vs ~471 km range) — without modeled charging stops, those paybacks are optimistic. Seed check: re-running fleets 16 and 30 with different traffic leaves payback unchanged to the day; only lean-fleet waits wobble (18–23 min)."
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Median wait versus payback days by fleet size">
        {[0, 15, 30, 60, 90].filter((t) => t <= maxY).map((t) => (
          <g key={`y${t}`}>
            <line x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} className="gridline" />
            <text x={padL - 6} y={yOf(t) + 4} textAnchor="end" className="tick-label">
              {t}m
            </text>
          </g>
        ))}
        {[0, 30, 60, 90, 120, 150].filter((t) => t <= maxX).map((t) => (
          <text key={`x${t}`} x={xOf(t)} y={H - 18} textAnchor="middle" className="tick-label">
            {t}d
          </text>
        ))}
        <text x={W - padR} y={H - 4} textAnchor="end" className="axis-label">
          days until the cab is paid off →
        </text>
        <text x={padL} y={12} className="axis-label">
          median wait ↑
        </text>
        <polyline points={line} fill="none" stroke={GOLD} strokeWidth={2} opacity={0.5} />
        {sorted.map((r) => {
          const range = (r as { waitP50MinRange?: [number, number] }).waitP50MinRange;
          return (
          <g key={r.fleet}>
            {range && (
              <line
                x1={xOf(r.paybackDays!)}
                x2={xOf(r.paybackDays!)}
                y1={yOf(range[0])}
                y2={yOf(range[1])}
                stroke={GOLD}
                strokeWidth={2}
                opacity={0.6}
              />
            )}
            <circle
              cx={xOf(r.paybackDays!)}
              cy={yOf(r.waitP50Min)}
              r={7}
              fill={r.fleet === 30 ? "#c9971c" : GOLD}
              stroke={SURFACE.page}
              strokeWidth={2}
              onMouseMove={(e) =>
                show(e, (
                  <>
                    <b>{r.fleet} cabs</b>
                    <div>wait {r.waitP50Min} min · payback {Math.round(r.paybackDays!)} d</div>
                    <div>{Math.round(r.ridesPerCab)} rides/cab · €{Math.round(r.marginPerCabEur)}/cab/day</div>
                  </>
                ))
              }
              onMouseLeave={hide}
            />
            <text
              x={xOf(r.paybackDays!) + 11}
              y={yOf(r.waitP50Min) + 4}
              className="series-label"
              fill={SURFACE.ink}
            >
              {r.fleet}
            </text>
          </g>
          );
        })}
      </svg>
      {node}
    </Figure>
  );
}
