import { useState, useSyncExternalStore } from "react";
import type { ReportData } from "../lib/data";
import { fmtClock, fmtEur, fmtPct } from "../lib/format";
import { replayStore } from "../map/replayStore";
import { storyFleet } from "../brief/ActThree";

function useReplay() {
  return useSyncExternalStore(replayStore.subscribe, replayStore.get);
}

/** Live HUD over the hero sim: clock, counters, two controls. */
function SimHud({ report }: { report: ReportData }) {
  const { timeSec, playing, follow } = useReplay();
  const { replay } = report;
  const served = replay.riders.filter((r) => r.dropoffSec !== null && timeSec >= r.dropoffSec).length;
  const waiting = replay.riders.filter(
    (r) => timeSec >= r.departSec && (r.pickupSec === null || timeSec < r.pickupSec),
  ).length;
  return (
    <div className="op-hud">
      <span className="op-hud-clock">{fmtClock(timeSec)}</span>
      <span className="op-hud-stat">
        <b>{served}</b>/{replay.riders.length} served
      </span>
      <span className="op-hud-stat">
        <b>{waiting}</b> waiting
      </span>
      <button
        className="btn"
        onClick={() =>
          replayStore.set(
            timeSec >= replay.meta.endSec
              ? { timeSec: replay.meta.startSec, playing: true }
              : { playing: !playing },
          )
        }
      >
        {playing ? "Pause" : "Play"}
      </button>
      <button className="btn" aria-pressed={follow} onClick={() => replayStore.set({ follow: !follow, playing: true })}>
        {follow ? "Overview" : "Ride along"}
      </button>
    </div>
  );
}

const ANSATZ = [
  {
    n: "01",
    title: "Real demand",
    line: "7,443 daily trips from TU Berlin's synthetic population (MATSim, 1% twin of the city)",
  },
  {
    n: "02",
    title: "Real streets",
    line: "The district rebuilt in SUMO: every signal, plus the evening's calibrated traffic",
  },
  {
    n: "03",
    title: "The experiment",
    line: "Every evening car trip hails a Cybercab — 88 runs: fleets 4–30, 3 seeds, pooled & solo, 2 districts",
  },
  {
    n: "04",
    title: "Honest verdict",
    line: "Every number sourced or simulated — the case against gets equal rigor",
  },
];

export function OnePager({ report }: { report: ReportData }) {
  const knee = storyFleet(report.sweep.byFleet);
  const rows = report.sweep.byFleet;
  const [fleetIdx, setFleetIdx] = useState(rows.indexOf(knee));
  const row = rows[fleetIdx];
  const median = report.costs.priceTable[0];
  const day = report.economics.day;
  const rdf = report.sweepReinickendorf?.byFleet.find(
    (r) => r.servedShare.min >= 0.99 && r.waitP50Min.mean <= 10,
  );
  const emptyA = row.emptyShare.mean / (1 - row.emptyShare.mean);

  return (
    <div className="op">
      {/* ---- screen 1: the sim is the hero ---- */}
      <section className="op-hero">
        <div className="op-hero-card">
          <p className="eyebrow">Eigenprojekt · Berlin · 2026</p>
          <h1>
            If Cybercabs came to <span style={{ color: "var(--gold)" }}>Moabit</span>
          </h1>
          <p className="op-lede">
            One Berlin neighborhood, rebuilt in a traffic simulator and handed a
            Tesla Cybercab fleet. Live behind this text: one full SUMO evening —
            gold cabs, white rings waiting, grey dots real traffic.
          </p>
          <div className="op-chiprow">
            <span className="op-chip">MATSim demand</span>
            <span className="op-chip">SUMO microsimulation</span>
            <span className="op-chip">real 2026 tariffs</span>
            <a className="op-chip link" href="#deep">
              full brief ↓
            </a>
          </div>
        </div>
        <SimHud report={report} />
      </section>

      {/* ---- screen 2: Ansatz + results ---- */}
      <section className="op-body">
        <div className="op-ansatz">
          {ANSATZ.map((s) => (
            <div key={s.n} className="op-step">
              <span className="op-step-n">{s.n}</span>
              <b>{s.title}</b>
              <p>{s.line}</p>
            </div>
          ))}
        </div>

        <h2 className="op-h2">What the simulation says</h2>
        <div className="op-results">
          <div className="op-card">
            <b>{knee.fleet} cabs</b>
            <p>
              serve {fmtPct(knee.servedShare.mean)} of the evening's car trips at{" "}
              {Math.round(knee.waitP50Min.mean)} min median wait — Austin-grade
            </p>
          </div>
          <div className="op-card">
            <b>{fmtEur(median.cybercabEur)}</b>
            <p>
              for the median trip vs {fmtEur(median.taxiEur)} in a Berlin taxi —
              the taxi loses at every distance
            </p>
          </div>
          <div className="op-card">
            <b>~{Math.round(day.paybackDays)} days</b>
            <p>
              for a $30k cab to pay for itself at Austin fares — energy is ~3% of
              revenue (estimate, assumptions published)
            </p>
          </div>
          <div className="op-card warn">
            <b>+{fmtPct(emptyA)}</b>
            <p>
              vehicle-km even if only drivers switch — deadheading is measured,
              not estimated. Realistic adoption: 6× worse
            </p>
          </div>
          <div className="op-card warn">
            <b>≤5% saved</b>
            <p>
              by pooling — two seats and 2-km rides barely overlap (21
              shared-dispatch runs)
            </p>
          </div>
          {rdf && (
            <div className="op-card gold">
              <b>Aim it outward</b>
              <p>
                Reinickendorf (transit-poor): {rdf.fleet} cabs serve{" "}
                {fmtPct(rdf.servedShare.mean)} at {Math.round(rdf.waitP50Min.mean)}{" "}
                min — robotaxis fill gaps, not city centers
              </p>
            </div>
          )}
        </div>

        <div className="op-explorer">
          <label className="caption" htmlFor="op-fleet">
            try a fleet size
          </label>
          <input
            id="op-fleet"
            type="range"
            min={0}
            max={rows.length - 1}
            value={fleetIdx}
            onChange={(e) => setFleetIdx(Number(e.target.value))}
          />
          <span className="op-exp-val">{row.fleet} cabs</span>
          <span className="op-exp-stat">{fmtPct(row.servedShare.mean)} served</span>
          <span className="op-exp-stat">{Math.round(row.waitP50Min.mean)} min wait</span>
          <span className="op-exp-stat">{fmtPct(row.emptyShare.mean)} empty km</span>
          <span className="caption">each value = a completed SUMO run</span>
        </div>

        <footer className="op-footer">
          <span>
            Built end-to-end: Python data pipeline → SUMO/libsumo experiments →
            this page (React, no backend).
          </span>
          <span className="op-badges">
            MATSim Open Berlin · BeST scenario (CC-BY) · SUMO 1.27 · 88 runs ·{" "}
            <a href="https://github.com/taruntanwar42/robotaxis-in-berlin">GitHub</a> ·{" "}
            <a href="#deep">full evidence brief (8 min read)</a>
          </span>
        </footer>
      </section>
    </div>
  );
}
