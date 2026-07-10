import { useSyncExternalStore } from "react";
import type { ReportData } from "../lib/data";
import { fmtClock, fmtInt } from "../lib/format";
import { replayStore } from "../map/replayStore";
import { Chip, Section, Stat } from "../ui/primitives";
import { CabViewer } from "./CabViewer";

export function Vehicle() {
  return (
    <Section id="vehicle" eyebrow="The machine" title="The Cybercab, as it actually exists">
      <div className="prose">
        <p>
          In production since <strong>February 2026</strong>: two seats, no
          steering wheel or pedals, and the most efficient car Tesla has
          built.{" "}
          <Chip href="https://en.wikipedia.org/wiki/Tesla_Cybercab">Wikipedia</Chip>{" "}
          <Chip href="https://insideevs.com/news/798790/tesla-cybercab-specs/">EPA filings</Chip>
        </p>
      </div>
      <CabViewer />
      <p className="caption" style={{ marginTop: "0.3rem" }}>
        3D model, for scale and shape
      </p>
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
            Reuters audit, Apr 2026 (via GVWire)
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
  const { timeSec, playing, speed, follow } = useReplay();
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
      stage
    >
      <div className="prose">
        <p>
          The corridor, rebuilt inside <a href="https://eclipse.dev/sumo/">SUMO</a>:
          every street, every signal, the evening's traffic from the{" "}
          <a href="https://github.com/mosaic-addons/best-scenario">BeST scenario</a>.
          Every private-car trip of the 18:00 hour hails a Cybercab instead;{" "}
          <strong>{replay.meta.fleet} cabs</strong> serve them.{" "}
          <Chip href="#methods" sim>
            method
          </Chip>
        </p>
        <p className="caption">
          gold dots: cabs (bright = carrying someone) · white rings: people
          waiting · grey dots: a sample of the evening's other traffic
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
        <button
          className="btn"
          aria-pressed={follow}
          onClick={() => replayStore.set({ follow: !follow, playing: true })}
        >
          {follow ? "Overview" : "Ride along"}
        </button>
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
        One full SUMO run, recorded (fleet {replay.meta.fleet}, seed{" "}
        {replay.meta.sumoSeed}); the sweep below covers fleets of 4-30.
      </p>
    </Section>
  );
}
