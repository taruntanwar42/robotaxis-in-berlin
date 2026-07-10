import type { ReportData, SweepData, SweepRow } from "../lib/data";
import { fmtPct } from "../lib/format";
import { Chip, Section } from "../ui/primitives";

/** Smallest fleet that serves ≥95% of requests at ≤10 min median wait. */
function serviceKnee(sweep: SweepData): SweepRow {
  const rows = sweep.byFleet;
  return (
    rows.find((r) => r.servedShare.min >= 0.95 && r.waitP50Min.mean <= 10) ??
    rows[rows.length - 1]
  );
}

function Cell({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr>
      <td style={{ color: "var(--ink-dim)" }}>{label}</td>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  );
}

export function CompareKiez({ report }: { report: ReportData }) {
  const rdf = report.sweepReinickendorf;
  const rdfDemand = report.reinickendorfDemand;
  if (!rdf || !rdfDemand) return null;

  const corridorKnee = serviceKnee(report.sweep);
  const rdfKnee = serviceKnee(rdf);
  const ev = report.demand.evening.byMode;
  const evTotal = Object.values(ev).reduce((s, n) => s + n, 0);
  const corridorPt = (ev.pt ?? 0) / evTotal;
  const corridorCar = ((ev.car ?? 0) + (ev.ride ?? 0)) / evTotal;
  const rdfTotal = Object.values(rdfDemand.byMode).reduce((s, n) => s + n, 0);
  const rdfCar = ((rdfDemand.byMode.car ?? 0) + (rdfDemand.byMode.ride ?? 0)) / rdfTotal;

  return (
    <Section id="where" eyebrow="The counter-test" title="Same fleet, different Kiez">
      <div className="prose">
        <p>
          If the catch is that robotaxis compete with buses and bikes, the fix
          should be geography: aim them where transit is weak. To test that, we
          ran the entire experiment again in <strong>Reinickendorf</strong> — an
          outer district where only {fmtPct(rdfDemand.ptShare)} of evening
          trips use transit, against {fmtPct(corridorPt)} in the corridor.{" "}
          <Chip href="#methods" sim>
            18 SUMO runs, second network
          </Chip>
        </p>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th></th>
            <th>Corridor (inner city)</th>
            <th>Reinickendorf (outer)</th>
          </tr>
        </thead>
        <tbody>
          <Cell label="transit share, evening" a={fmtPct(corridorPt)} b={fmtPct(rdfDemand.ptShare)} />
          <Cell label="car share, evening" a={fmtPct(corridorCar)} b={fmtPct(rdfCar)} />
          <Cell
            label="robotaxi requests"
            a={`${report.sweep.byFleet[0].requests} in 1 h`}
            b={`${rdf.byFleet[0].requests} in 3 h`}
          />
          <Cell
            label="fleet for good service"
            a={`${corridorKnee.fleet} cabs`}
            b={`${rdfKnee.fleet} cabs`}
          />
          <Cell
            label="median wait at that fleet"
            a={`${corridorKnee.waitP50Min.mean.toFixed(1)} min`}
            b={`${rdfKnee.waitP50Min.mean.toFixed(1)} min`}
          />
          <Cell
            label="empty km share"
            a={fmtPct(corridorKnee.emptyShare.mean)}
            b={fmtPct(rdfKnee.emptyShare.mean)}
          />
        </tbody>
      </table>
      <div className="prose">
        <p>
          The outer district is where the case gets interesting:{" "}
          <strong>{rdfKnee.fleet} cabs serve every request at{" "}
          {rdfKnee.waitP50Min.mean.toFixed(1)}-minute median waits</strong> —
          less than half the corridor's fleet buys better service, because
          thin demand means a cab is almost always free when someone hails.
          And with barely any transit to cannibalize, each ride displaces a
          car trip far more often.
        </p>
        <p>
          The price of sparsity shows in the empty kilometres (
          {fmtPct(rdfKnee.emptyShare.mean)} — deadhead legs are long between
          scattered pickups) and in the operator's thinner revenue per cab.
          “Aimed” now has a concrete meaning: <strong>outer districts first
          </strong> — where the service fills a gap instead of fighting the
          U-Bahn.
        </p>
      </div>
    </Section>
  );
}
