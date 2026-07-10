import { MODE_HEX, MODE_LABEL, MODE_ORDER, type DemandData } from "../lib/data";
import { fmtInt, fmtPct } from "../lib/format";
import { Figure, INK_FAINT, niceTicks, useTooltip } from "./common";
import { BAR_NEUTRAL, GOLD, SURFACE } from "../lib/palette";

/** Mode split as a labeled bar list — identity + magnitude, direct-labeled. */
export function ModeSplitBars({ demand }: { demand: DemandData }) {
  const total = Object.values(demand.modeSplit).reduce((a, b) => a + b, 0);
  const rows = MODE_ORDER.filter((m) => demand.modeSplit[m]).map((m) => ({
    mode: m,
    n: demand.modeSplit[m],
    share: demand.modeSplit[m] / total,
  }));
  const max = Math.max(...rows.map((r) => r.share));
  const W = 720;
  const rowH = 34;
  const labelW = 118;
  const H = rows.length * rowH + 6;

  return (
    <Figure
      title="How this neighborhood already moves"
      sub={`all ${fmtInt(total)} resident trips on the simulated day · 1% twin`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mode split of daily trips">
        {rows.map((r, i) => {
          const y = i * rowH + 4;
          const w = Math.max(4, (r.share / max) * (W - labelW - 165));
          return (
            <g key={r.mode}>
              <text x={labelW - 10} y={y + 17} textAnchor="end" className="tick-label" fill={SURFACE.inkSecondary}>
                {MODE_LABEL[r.mode]}
              </text>
              <rect x={labelW} y={y} width={w} height={22} rx={4} fill={MODE_HEX[r.mode]} />
              <text x={labelW + w + 8} y={y + 16} className="series-label" fill={SURFACE.ink}>
                {fmtPct(r.share)}
                <tspan fill={INK_FAINT}> · {fmtInt(r.n)} trips</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}

/** Trips per hour, stacked by mode. */
export function HourlyCurve({ demand }: { demand: DemandData }) {
  const { show, hide, node } = useTooltip();
  const hours = demand.hourly.filter((h) => h.hour < 27);
  const maxTrips = Math.max(...hours.map((h) => h.trips));
  const ticks = niceTicks(maxTrips);
  const W = 720;
  const H = 240;
  const padL = 44;
  const padB = 26;
  const padT = 10;
  const plotW = W - padL - 8;
  const plotH = H - padT - padB;
  const barW = plotW / 27 - 2;
  const yOf = (v: number) => padT + plotH - (v / ticks[ticks.length - 1]) * plotH;

  return (
    <Figure
      title="A day in the corridor, hour by hour"
      sub="trips departing per hour, stacked by mode · 1% twin"
      caption={
        <>
          The gold band marks 18:00–19:00 — the hour the fleet experiment runs.
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trips per hour by mode">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={yOf(t)} y2={yOf(t)} className="gridline" />
            <text x={padL - 6} y={yOf(t) + 4} textAnchor="end" className="tick-label">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        {/* experiment-hour highlight */}
        <rect
          x={padL + (18 / 27) * plotW}
          y={padT}
          width={plotW / 27}
          height={plotH}
          fill="rgba(169,123,0,0.10)"
        />
        {hours.map((h) => {
          const x = padL + (h.hour / 27) * plotW + 1;
          let y = yOf(0);
          return (
            <g
              key={h.hour}
              onMouseMove={(e) =>
                show(e, (
                  <>
                    <b>{String(h.hour % 24).padStart(2, "0")}:00</b> · {fmtInt(h.trips)} trips
                    {MODE_ORDER.filter((m) => h.byMode[m]).map((m) => (
                      <div key={m}>
                        {MODE_LABEL[m]}: {fmtInt(h.byMode[m])}
                      </div>
                    ))}
                  </>
                ))
              }
              onMouseLeave={hide}
            >
              {MODE_ORDER.filter((m) => h.byMode[m]).map((m) => {
                const hgt = (h.byMode[m] / ticks[ticks.length - 1]) * plotH;
                y -= hgt;
                return (
                  <rect
                    key={m}
                    x={x}
                    y={y + 1}
                    width={Math.max(2, barW)}
                    height={Math.max(0, hgt - 2)}
                    fill={MODE_HEX[m]}
                    rx={1.5}
                  />
                );
              })}
            </g>
          );
        })}
        {[0, 6, 12, 18, 24].map((hr) => (
          <text
            key={hr}
            x={padL + (hr / 27) * plotW}
            y={H - 8}
            className="tick-label"
            textAnchor="middle"
          >
            {String(hr % 24).padStart(2, "0")}:00
          </text>
        ))}
      </svg>
      <div className="chart-sub" aria-hidden="true">
        {MODE_ORDER.map((m) => (
          <span key={m} style={{ marginRight: "1em" }}>
            <span
              style={{
                display: "inline-block",
                width: 9,
                height: 9,
                borderRadius: 2,
                background: MODE_HEX[m],
                marginRight: 5,
              }}
            />
            {MODE_LABEL[m]}
          </span>
        ))}
      </div>
      {node}
    </Figure>
  );
}

/** Trip distance histogram with median marker. */
export function DistanceHistogram({ demand }: { demand: DemandData }) {
  const { show, hide, node } = useTooltip();
  const { bins, binWidthKm } = demand.distanceHistogramKm;
  const max = Math.max(...bins);
  const W = 720;
  const H = 220;
  const padL = 44;
  const padB = 30;
  const padT = 8;
  const plotW = W - padL - 8;
  const plotH = H - padT - padB;
  const ticks = niceTicks(max);
  const yOf = (v: number) => padT + plotH - (v / ticks[ticks.length - 1]) * plotH;
  const medianX = padL + (demand.medianTripKm / (bins.length * binWidthKm)) * plotW;

  return (
    <Figure
      title="Most trips here are short"
      sub="trip distances, 500 m bins · all modes, 1% twin"
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trip distance histogram">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 8} y1={yOf(t)} y2={yOf(t)} className="gridline" />
            <text x={padL - 6} y={yOf(t) + 4} textAnchor="end" className="tick-label">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        {bins.map((n, i) => {
          const x = padL + (i / bins.length) * plotW + 1;
          const from = (i * binWidthKm).toFixed(1);
          const to = ((i + 1) * binWidthKm).toFixed(1);
          return (
            <rect
              key={i}
              x={x}
              y={yOf(n)}
              width={plotW / bins.length - 2}
              height={yOf(0) - yOf(n)}
              rx={2}
              fill={BAR_NEUTRAL}
              onMouseMove={(e) =>
                show(e, (
                  <>
                    <b>
                      {i === bins.length - 1 ? `≥ ${from} km` : `${from}–${to} km`}
                    </b>
                    <div>{fmtInt(n)} trips</div>
                  </>
                ))
              }
              onMouseLeave={hide}
            />
          );
        })}
        <line x1={medianX} x2={medianX} y1={padT} y2={yOf(0)} stroke={GOLD} strokeWidth={2} strokeDasharray="5 4" />
        <text x={medianX + 7} y={padT + 14} className="series-label" fill={GOLD}>
          median {demand.medianTripKm} km
        </text>
        {[0, 2, 4, 6, 8, 10].map((km) => (
          <text
            key={km}
            x={padL + (km / (bins.length * binWidthKm)) * plotW}
            y={H - 8}
            className="tick-label"
            textAnchor="middle"
          >
            {km === 10 ? "10+ km" : `${km} km`}
          </text>
        ))}
      </svg>
      {node}
    </Figure>
  );
}
