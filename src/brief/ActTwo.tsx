import { useSyncExternalStore } from "react";
import type { ReportData } from "../lib/data";
import { fmtClock, fmtInt } from "../lib/format";
import { replayStore } from "../map/replayStore";
import { Chip, Section, Stat } from "../ui/primitives";

export function Vehicle() {
  return (
    <Section id="vehicle" eyebrow="The machine" title="The Cybercab, as it actually exists">
      <div className="prose">
        <p>
          Not a rendering: the first production Cybercab left Gigafactory Texas
          in <strong>February 2026</strong>. It seats two, has no steering wheel
          or pedals, and is the most efficient car Tesla has built.{" "}
          <Chip href="https://en.wikipedia.org/wiki/Tesla_Cybercab">Wikipedia</Chip>{" "}
          <Chip href="https://insideevs.com/news/798790/tesla-cybercab-specs/">EPA filings</Chip>
        </p>
      </div>
      <div className="stat-row">
        <Stat value="2" label="seats" gold />
        <Stat value="~48 kWh" label="battery" />
        <Stat value="103 Wh/km" label="consumption" />
        <Stat value="~470 km" label="real range" />
        <Stat value="$30,000" label="target price" />
      </div>
      <div className="prose">
        <p>
          And it already runs a real service. In Austin, Tesla charges{" "}
          <strong>$3.00 base + $1.40 per mile</strong>. Typical waits run{" "}
          <strong>10–15 minutes</strong>; a Reuters audit through April 2026
          found waits over 15 minutes half the time and{" "}
          <strong>no car available at all in 27%</strong> of checks.{" "}
          <Chip href="https://teslanorth.com/2026/03/07/tesla-robotaxi-prices-jump-in-austin-here-is-the-new-cost-for-a-5-mile-trip/">
            fares 03/2026
          </Chip>{" "}
          <Chip href="https://gvwire.com/2026/05/13/teslas-robotaxi-rollout-features-texas-sized-wait-times/">
            Reuters audit
          </Chip>
        </p>
        <p>
          Those Austin numbers anchor everything below: they are what this
          technology delivers today, not what a keynote promised.
        </p>
      </div>
    </Section>
  );
}

function useReplay() {
  return useSyncExternalStore(replayStore.subscribe, replayStore.get);
}

export function Experiment({ report }: { report: ReportData }) {
  const { replay } = report;
  const { timeSec, playing, speed } = useReplay();
  const { startSec } = replay.meta;
  const endSec = replay.meta.endSec;

  const waiting = replay.riders.filter(
    (r) => timeSec >= r.departSec && (r.pickupSec === null || timeSec < r.pickupSec),
  ).length;
  const riding = replay.riders.filter(
    (r) => r.pickupSec !== null && timeSec >= r.pickupSec && (r.dropoffSec === null || timeSec < r.dropoffSec),
  ).length;
  const served = replay.riders.filter((r) => r.dropoffSec !== null && timeSec >= r.dropoffSec).length;

  return (
    <Section
      id="experiment"
      eyebrow="The experiment"
      title="One evening, rerun with a fleet"
    >
      <div className="prose">
        <p>
          We rebuilt the corridor inside{" "}
          <a href="https://eclipse.dev/sumo/">SUMO</a>, a microscopic traffic
          simulator: every street, every signal, and the evening's background
          traffic calibrated from the{" "}
          <a href="https://github.com/mosaic-addons/best-scenario">BeST Berlin scenario</a>.
          Then we asked every private-car trip of the 18:00 hour to hail a
          Cybercab instead, and let SUMO's own taxi dispatcher serve them with{" "}
          <strong>{replay.meta.fleet} cabs</strong>.{" "}
          <Chip href="#methods" sim>
            method
          </Chip>
        </p>
        <p>
          This is a recording of that run — gold dots are cabs (bright when
          carrying someone), white rings are people waiting.
        </p>
      </div>
      <div className="control-row" role="group" aria-label="Replay controls">
        <button
          className="btn primary"
          onClick={() => {
            if (timeSec >= endSec) replayStore.set({ timeSec: startSec, playing: true });
            else replayStore.set({ playing: !playing });
          }}
        >
          {playing ? "Pause" : timeSec >= endSec ? "Replay" : "Play"}
        </button>
        {[60, 180, 420].map((s) => (
          <button
            key={s}
            className="btn"
            aria-pressed={speed === s}
            onClick={() => replayStore.set({ speed: s })}
          >
            {s / 60}×min/s
          </button>
        ))}
        <input
          type="range"
          min={startSec}
          max={endSec}
          value={timeSec}
          onChange={(e) => replayStore.set({ timeSec: Number(e.target.value) })}
          aria-label="Simulation time"
          style={{ flex: 1, minWidth: "8rem" }}
        />
        <span className="caption" style={{ fontSize: "0.95rem", color: "var(--gold)" }}>
          {fmtClock(timeSec)}
        </span>
      </div>
      <div className="stat-row" style={{ margin: "0.8rem 0 0" }}>
        <Stat value={fmtInt(waiting)} label="waiting" />
        <Stat value={fmtInt(riding)} label="riding" gold />
        <Stat value={`${fmtInt(served)} / ${fmtInt(replay.riders.length)}`} label="served" />
      </div>
      <p className="caption" style={{ marginTop: "1rem" }}>
        Recorded from one full SUMO run (fleet {replay.meta.fleet}, traffic seed{" "}
        {replay.meta.sumoSeed}); the parameter sweep below covers fleets of 4 to 30.
      </p>
    </Section>
  );
}
