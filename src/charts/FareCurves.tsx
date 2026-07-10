import { useState } from "react";
import type { CostsData, DemandData } from "../lib/data";
import { fmtEur } from "../lib/format";
import { Figure, niceTicks } from "./common";
import { ENTITY, SURFACE } from "../lib/palette";

const SERIES: {
  key: keyof CostsData["curvesEur"];
  label: string;
  color: string;
  dash?: string;
}[] = [
  { key: "taxi", label: "Berlin taxi", color: ENTITY.taxi },
  { key: "cybercab", label: "Cybercab", color: ENTITY.cybercab },
  { key: "bvgSingle", label: "BVG single", color: ENTITY.bvg },
  { key: "carFull", label: "Own car, full", color: ENTITY.car },
  { key: "carMarginal", label: "Own car, fuel", color: ENTITY.car, dash: "5 4" },
];

export function FareCurves({ costs, demand }: { costs: CostsData; demand: DemandData }) {
  const [hoverKm, setHoverKm] = useState<number | null>(null);
  const grid = costs.gridKm;
  const maxKm = grid[grid.length - 1];
  const maxEur = 20;
  const W = 720;
  const H = 340;
  const padL = 48;
  const padB = 30;
  const padT = 10;
  const padR = 168;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xOf = (km: number) => padL + (km / maxKm) * plotW;
  const ticks = niceTicks(maxEur);
  const top = ticks[ticks.length - 1];
  const yOf = (eur: number) => padT + plotH - (Math.min(eur, top) / top) * plotH;

  const hoverIdx =
    hoverKm === null ? null : Math.min(grid.length - 1, Math.max(0, Math.round((hoverKm - grid[0]) / 0.1)));

  return (
    <Figure
      title="What the same trip costs, by distance"
      sub="one person, one trip, 2026 tariffs · lower is cheaper"
      caption={
        <>
          Gold band: the neighborhood's typical trip range around its{" "}
          {demand.medianTripKm} km median. Deutschlandticket holders pay ~€0
          marginal on BVG. Fares are per vehicle (2 seats); BVG is per person.
        </>
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cost per trip by distance for five options"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const km = ((e.clientX - rect.left) / rect.width * W - padL) / plotW * maxKm;
          setHoverKm(km >= grid[0] && km <= maxKm ? km : null);
        }}
        onMouseLeave={() => setHoverKm(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={padL + plotW} y1={yOf(t)} y2={yOf(t)} className="gridline" />
            <text x={padL - 6} y={yOf(t) + 4} textAnchor="end" className="tick-label">
              €{t}
            </text>
          </g>
        ))}
        {/* typical-trip band: 0.6–2.6 km (middle half of corridor trips) */}
        <rect x={xOf(0.6)} y={padT} width={xOf(2.6) - xOf(0.6)} height={plotH} fill="rgba(169,123,0,0.08)" />
        {(() => {
          // dodge right-edge labels to >=14px separation
          const endYs = SERIES.map((s) => yOf(costs.curvesEur[s.key][grid.length - 1]));
          const order = endYs.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
          const placed: number[] = [];
          for (const [y] of order) placed.push(placed.length ? Math.max(y, placed[placed.length - 1] + 14) : y);
          const labelY: number[] = [];
          order.forEach(([, idx], k) => (labelY[idx] = placed[k]));
          return SERIES.map((s, i) => {
            const pts = grid
              .map((km, j) => `${xOf(km)},${yOf(costs.curvesEur[s.key][j])}`)
              .join(" ");
            return (
              <g key={s.key}>
                <polyline
                  points={pts}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.2}
                  strokeDasharray={s.dash}
                  strokeLinejoin="round"
                />
                <text x={padL + plotW + 8} y={labelY[i] + 4} className="series-label" fill={s.color}>
                  {s.label}
                </text>
              </g>
            );
          });
        })()}
        {hoverIdx !== null && (
          <g pointerEvents="none">
            <line
              x1={xOf(grid[hoverIdx])}
              x2={xOf(grid[hoverIdx])}
              y1={padT}
              y2={padT + plotH}
              stroke={SURFACE.inkFaint}
              strokeWidth={1}
            />
            {SERIES.map((s) => (
              <circle
                key={s.key}
                cx={xOf(grid[hoverIdx])}
                cy={yOf(costs.curvesEur[s.key][hoverIdx])}
                r={4}
                fill={s.color}
                stroke={SURFACE.page}
                strokeWidth={1.5}
              />
            ))}
            <g transform={`translate(${Math.min(xOf(grid[hoverIdx]) + 10, padL + plotW - 150)}, ${padT + 6})`}>
              <rect width={150} height={92} rx={8} fill={SURFACE.page} stroke={SURFACE.hairline} />
              <text x={10} y={17} className="series-label" fill={SURFACE.ink}>
                {grid[hoverIdx].toFixed(1)} km
              </text>
              {SERIES.map((s, i) => (
                <text key={s.key} x={10} y={33 + i * 14} className="tick-label" fill={s.color}>
                  {s.label.split(",")[0].split(" (")[0]}: {fmtEur(costs.curvesEur[s.key][hoverIdx])}
                </text>
              ))}
            </g>
          </g>
        )}
        {[0, 2, 4, 6, 8, 10].map((km) => (
          <text key={km} x={xOf(km)} y={H - 8} textAnchor="middle" className="tick-label">
            {km} km
          </text>
        ))}
      </svg>
    </Figure>
  );
}
