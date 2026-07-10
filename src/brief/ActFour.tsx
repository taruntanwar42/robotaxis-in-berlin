import { useState } from "react";
import type { ReportData, SweepRow } from "../lib/data";
import { fmtInt, fmtPct } from "../lib/format";
import { Chip, Section, Stat } from "../ui/primitives";
import { storyFleet } from "./ActThree";

/** Net vehicle-km math for one sweep row under two adoption stories.
 * A: every rider is an ex-driver → removed km = occupied km, added = total cab km.
 * B: riders adopt in proportion to how the neighborhood actually moves →
 *    only the car-share of riders remove any car-km. */
function netKm(row: SweepRow, carShareOfAdopters: number) {
  const occupied = row.cabTotalKm.mean * (1 - row.emptyShare.mean);
  const removed = occupied * carShareOfAdopters;
  const added = row.cabTotalKm.mean;
  return { removed, added, net: added - removed, netShare: (added - removed) / removed };
}

export function Catch({ report }: { report: ReportData }) {
  const knee = storyFleet(report.sweep.byFleet);
  const evening = report.demand.evening.byMode;
  const eveningTotal = Object.values(evening).reduce((a, b) => a + b, 0);
  const carShare = ((evening.car ?? 0) + (evening.ride ?? 0)) / eveningTotal;
  const a = netKm(knee, 1.0);
  const b = netKm(knee, carShare);
  return (
    <Section id="catch" eyebrow="The catch" title="The same fleet can make traffic worse">
      <div className="prose">
        <p>
          Robotaxi pitches quietly assume every rider is an ex-driver. Our own
          simulation shows why that assumption is doing all the work — the
          deadhead kilometers are measured, not estimated:{" "}
          <strong>{fmtPct(knee.emptyShare.mean)} of everything the fleet drives
          is empty</strong>, cruising to the next pickup.{" "}
          <Chip href="#methods" sim>
            fleet {knee.fleet} runs
          </Chip>
        </p>
      </div>
      <div className="verdict-grid">
        <div className="verdict-card">
          <h3>Story A — “only drivers switch”</h3>
          <p>
            The fleet drives {fmtInt(a.added)} km to replace {fmtInt(a.removed)}{" "}
            km of private driving:{" "}
            <strong style={{ color: "var(--ink)" }}>
              +{fmtPct(a.netShare)} vehicle-km
            </strong>{" "}
            — even the best case adds traffic, because empty cabs still drive.
          </p>
        </div>
        <div className="verdict-card warn">
          <h3>Story B — riders come from every mode</h3>
          <p>
            If adoption mirrors how this neighborhood actually moves, only{" "}
            {fmtPct(carShare)} of riders give up a car trip; the rest step out
            of a bus, off a bike, off the sidewalk. Then{" "}
            <strong style={{ color: "var(--c-car)" }}>
              the fleet drives {(b.added / b.removed).toFixed(1)} km for every
              1 km of private driving it removes
            </strong>{" "}
            — a net +{(b.added / b.removed - 1).toFixed(1)} km of traffic per
            car-km replaced. Illustrative, not measured: the simulated trips
            are car-length; walkers would ride shorter, BVG riders longer. We
            treat B as the realistic story; A is the industry's own best case.
          </p>
        </div>
      </div>
      <div className="prose">
        <p>What the simulation cannot see, listed rather than hidden:</p>
        <ul style={{ color: "var(--ink-dim)", lineHeight: 1.8 }}>
          <li>
            <strong style={{ color: "var(--ink)" }}>Two seats — and we tested
            pooling</strong>: rerunning the whole sweep with SUMO's shared
            dispatch matched ~30% of riders into pairs, yet saved at most ~5%
            of fleet-km, and only with cabs to spare. Two-kilometre trips
            barely overlap; pooling does not rescue the numbers above.{" "}
            <Chip href="#methods" sim>
              21 pooled runs
            </Chip>
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Induced demand</strong> — a
            cheap door-to-door ride creates trips that never existed. That is
            more mobility, and more traffic.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>BVG's fare box</strong> —
            every won rider is revenue taken from the system that, together
            with walking and cycling, moves 80% of this neighborhood's trips.
          </li>
          <li>
            <strong style={{ color: "var(--ink)" }}>Kerb chaos, night hours,
            weather</strong> — one simulated fair-weather evening is not a year
            of operations.
          </li>
        </ul>
      </div>
    </Section>
  );
}

export function Verdict({ report }: { report: ReportData }) {
  const rows = report.sweep.byFleet;
  const knee = storyFleet(rows);
  const [fleetIdx, setFleetIdx] = useState(rows.indexOf(knee));
  const [storyB, setStoryB] = useState(true);
  const row = rows[fleetIdx];
  const evening = report.demand.evening.byMode;
  const eveningTotal = Object.values(evening).reduce((a, b) => a + b, 0);
  const carShare = ((evening.car ?? 0) + (evening.ride ?? 0)) / eveningTotal;
  const km = netKm(row, storyB ? carShare : 1.0);

  return (
    <Section id="verdict" eyebrow="The verdict" title="A better taxi, not a better city — unless it's aimed">
      <div className="verdict-grid">
        <div className="verdict-card">
          <h3>It ends the taxi as we know it</h3>
          <p>
            Cheaper at every distance, no shift premiums, no drivers to pay.
            The Austin tariff applied here roughly halves the price of a cab.
          </p>
        </div>
        <div className="verdict-card">
          <h3>It cannot out-price the U-Bahn</h3>
          <p>
            Beyond ~{report.costs.breakEvens.bvgCheaperThanCybercabFromKm} km a
            BVG ticket wins, and a Deutschlandticket makes transit's marginal
            price zero. Robotaxis compete with taxis and car ownership — not
            with mass transit.
          </p>
        </div>
        <div className="verdict-card">
          <h3>Service is a numbers game</h3>
          <p>
            {knee.fleet} cabs (twin scale) serve {fmtPct(knee.servedShare.mean)}{" "}
            of requests at ~{Math.round(knee.waitP50Min.mean)} min median wait —
            though one rider in ten still waits {Math.round(knee.waitP90Min.mean)}+
            minutes. Austin-grade, for better and worse.
          </p>
        </div>
        <div className="verdict-card warn">
          <h3>Unaimed, it adds traffic</h3>
          <p>
            Deadheading adds {fmtPct(netKm(knee, 1).netShare)} vehicle-km with
            our baseline dispatcher (a smarter one deadheads less); realistic
            adoption multiplies it. The win condition is replacing car{" "}
            <em>ownership</em>, not bus rides.
          </p>
        </div>
      </div>

      <h3 style={{ margin: "2.4rem 0 0.6rem", fontSize: "1.15rem" }}>
        Run the numbers yourself
      </h3>
      <p className="caption" style={{ marginBottom: "0.8rem" }}>
        every value below comes from a completed SUMO run — nothing is
        interpolated
      </p>
      <div className="control-row">
        <label className="caption" htmlFor="fleet-slider" style={{ fontSize: "0.8rem" }}>
          fleet
        </label>
        <input
          id="fleet-slider"
          type="range"
          min={0}
          max={rows.length - 1}
          value={fleetIdx}
          onChange={(e) => setFleetIdx(Number(e.target.value))}
          style={{ flex: 1, maxWidth: "16rem" }}
        />
        <span className="caption" style={{ color: "var(--gold)", fontSize: "0.95rem" }}>
          {row.fleet} cabs
        </span>
        <button className="btn" aria-pressed={!storyB} onClick={() => setStoryB(false)}>
          only drivers switch
        </button>
        <button className="btn" aria-pressed={storyB} onClick={() => setStoryB(true)}>
          all modes switch
        </button>
      </div>
      <div className="stat-row">
        <Stat value={fmtPct(row.servedShare.mean)} label="requests served" gold />
        <Stat value={`${Math.round(row.waitP50Min.mean)} min`} label="median wait" />
        <Stat value={`${Math.round(row.waitP90Min.mean)} min`} label="p90 wait" />
        <Stat value={fmtPct(row.emptyShare.mean)} label="empty km" />
        <Stat value={`${row.kwh.mean.toFixed(0)} kWh`} label="fleet energy" />
        <Stat
          value={`€${Math.round(
            report.economics.perFleet.find((f) => f.fleet === row.fleet)?.revenuePerCabEur ?? 0,
          )}`}
          label="revenue / cab / hour"
        />
        <Stat
          value={`${(km.added / km.removed).toFixed(1)}×`}
          label="km driven per car-km replaced"
        />
      </div>
      <p className="caption">
        1% twin: multiply fleet and rider counts by 100 to picture the real
        corridor. Spread across 3 traffic seeds shown in the charts above.
        Three of the 125 requests sit on kerbs the road-network cut cannot
        reach — no fleet size serves them, which is why served tops out at 98%.
      </p>
    </Section>
  );
}

export function Methods({ report }: { report: ReportData }) {
  return (
    <Section id="methods" eyebrow="Method & sources" title="Where every number comes from">
      <div className="prose">
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem", lineHeight: 2 }}>
          MATSim Open Berlin v6.4 (TU Berlin, 1% sample)
          <br />→ corridor extract: trips with origin &amp; destination inside
          Charlottenburg–Moabit–Tiergarten (ALKIS boundaries + 250 m)
          <br />→ SUMO 1.27 twin: corridor street network, signals, BeST
          background traffic
          <br />→ 21 fleet runs (7 sizes × 3 seeds), built-in taxi dispatch
          (greedyClosest), cabs staged at taxi stands
          <br />→ operator economics: Austin tariff × sweep outputs; the
          day figures scale the evening hour by the corridor's demand curve
          (estimate) with €20/cab/day overhead (assumption)
          <br />→ this page (static JSON; no backend, nothing live)
        </p>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Constant</th>
            <th>Value</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cybercab fare</td>
            <td>$3.00 + $1.40/mi → EUR ×0.92</td>
            <td><a href="https://teslanorth.com/2026/03/07/tesla-robotaxi-prices-jump-in-austin-here-is-the-new-cost-for-a-5-mile-trip/">Austin tariff, Mar 2026</a></td>
          </tr>
          <tr>
            <td>Cybercab consumption</td>
            <td>103 Wh/km (165 Wh/mi)</td>
            <td><a href="https://insideevs.com/news/798790/tesla-cybercab-specs/">EPA filing</a></td>
          </tr>
          <tr>
            <td>Berlin taxi tariff</td>
            <td>€4.30 + €2.80/2.60/2.10 per km</td>
            <td><a href="https://www.berlin.de/en/public-transportation/1756978-2913840-taxi-phone-numbers-fares-rules.en.html">berlin.de, 2026</a></td>
          </tr>
          <tr>
            <td>BVG single AB</td>
            <td>€4.00 (2026)</td>
            <td><a href="https://www.bvg.de/en/subscriptions-and-tickets/all-tickets">bvg.de</a></td>
          </tr>
          <tr>
            <td>Private car cost</td>
            <td>€0.40/km full · €0.12/km fuel</td>
            <td><a href="https://allaboutberlin.com/guides/car-cost-of-ownership-germany">ADAC-style estimate</a></td>
          </tr>
          <tr>
            <td>Austin service reality</td>
            <td>10–15 min waits; 27% unavailable</td>
            <td><a href="https://gvwire.com/2026/05/13/teslas-robotaxi-rollout-features-texas-sized-wait-times/">Reuters audit, Apr 2026 (via GVWire)</a></td>
          </tr>
        </tbody>
      </table>
      <div className="prose">
        <p style={{ fontWeight: 600, marginBottom: "0.4rem" }}>Known limits, stated plainly:</p>
        <ul style={{ color: "var(--ink-dim)", lineHeight: 1.8, marginTop: 0 }}>
          <li>
            1% sample: small counts are noisy; we show seed spreads and round
            honestly. Scaling ×100 ignores density economies that favor bigger
            real fleets.
          </li>
          <li>
            Two counting rules coexist: request extraction filters by departure
            second and kerb reachability (125 requests), the demand table by
            origin hour (120 evening car trips). We kept both pipelines as
            built rather than quietly reconciling them.
          </li>
          <li>
            The MATSim attribute for car availability is uninformative in this
            plans file (every adult has one), so no claim here uses it.
          </li>
          <li>
            Dispatch is SUMO's greedyClosest — a competent baseline, not an
            optimized commercial dispatcher. A parallel 21-run pooled sweep
            (greedyShared, published as sweep-pooled.json) paired ~30% of
            riders but saved ≤5% fleet-km; note SUMO couples shared dispatch
            to FIFO assignment, so its worse waits confound the comparison —
            we cite only the km result, which is robust.
          </li>
          <li>
            One fair-weather synthetic weekday evening; no nights, no rain, no
            U-Bahn strikes.
          </li>
        </ul>
        <p className="caption" style={{ marginTop: "1.6rem" }}>
          Data: <a href="https://github.com/matsim-scenarios/matsim-berlin">MATSim Open Berlin</a> ·{" "}
          <a href="https://github.com/mosaic-addons/best-scenario">BeST scenario</a> (CC-BY 4.0 —
          Schrab et al. 2023) · Berlin ALKIS district boundaries ·{" "}
          <a href="https://github.com/taruntanwar42/robotaxis-in-berlin">code &amp; pipeline on GitHub</a>.
          Scanned {fmtInt(report.demand.meta.personsRead)} synthetic Berliners
          in the MATSim plans; 2,926 live in the corridor; their 125 evening
          car trips were simulated as requests. No cookies, no tracking.
        </p>
      </div>
    </Section>
  );
}
