import type { ReportData, SweepRow } from "../lib/data";
import { fmtEur, fmtInt, fmtPct } from "../lib/format";
import { Chip, Section, Stat } from "../ui/primitives";
import { SweepChart } from "../charts/SweepChart";
import { FareCurves } from "../charts/FareCurves";
import { Figure } from "../charts/common";

/** The fleet the narrative leans on: smallest that serves ≥95% of requests,
 * else the biggest simulated. */
export function storyFleet(rows: SweepRow[]): SweepRow {
  return rows.find((r) => r.servedShare.min >= 0.95) ?? rows[rows.length - 1];
}

export function FindingService({ report }: { report: ReportData }) {
  const rows = report.sweep.byFleet;
  const knee = storyFleet(rows);
  const smallest = rows[0];
  return (
    <Section id="service" eyebrow="Finding 01 · Service" title="Waits are the price of a small fleet">
      <div className="prose">
        <p>
          Of the hour's 452 trips, only the{" "}
          <strong>{fmtInt(rows[0].requests)} made by car or as a car
          passenger</strong> become Cybercab requests — walks, bikes and BVG
          rides stay as they are (≈ {fmtInt(rows[0].requests * 100)} real
          requests). We reran the same evening with seven fleet sizes and
          three traffic conditions each.{" "}
          <Chip href="#methods" sim>
            21 SUMO runs
          </Chip>
        </p>
        <p>
          A fleet of {smallest.fleet} is overwhelmed: median waits of{" "}
          {Math.round(smallest.waitP50Min.mean)} minutes and{" "}
          {fmtPct(1 - smallest.servedShare.mean)} of riders never picked up. It
          takes <strong>{knee.fleet} cabs</strong> — one per{" "}
          {Math.round(knee.requests / knee.fleet)} requests — before waits reach{" "}
          <strong>{Math.round(knee.waitP50Min.mean)} minutes at the median</strong>{" "}
          ({Math.round(knee.waitP90Min.mean)} at the 90th percentile) and{" "}
          {fmtPct(knee.servedShare.mean)} of requests are served. That is the
          same league as Tesla's real Austin service today — for better and
          worse.
        </p>
      </div>
      <SweepChart sweep={report.sweep} />
      <div className="prose">
        <p className="caption">
          Scale honestly: {knee.fleet} cabs in the 1% twin ≈ {fmtInt(knee.fleet * 100)}
          {" "}cabs for the real corridor — before pooling, and knowing that
          denser real fleets dispatch more efficiently than our miniature, so
          treat it as an upper bound.
        </p>
      </div>
    </Section>
  );
}

export function FindingFare({ report }: { report: ReportData }) {
  const { costs, demand } = report;
  const median = costs.priceTable[0];
  return (
    <Section
      id="fare"
      eyebrow="Finding 02 · Price"
      title="Cheaper than any taxi. Past 1.6 km, the U-Bahn wins."
    >
      <div className="prose">
        <p>
          Apply Tesla's real Austin tariff to Berlin distances and the taxi
          trade cannot compete anywhere on this chart: a Cybercab undercuts the
          regulated Berlin taxi at <strong>every distance</strong> — the typical{" "}
          {demand.medianTripKm} km neighborhood trip costs{" "}
          <strong>{fmtEur(median.cybercabEur)}</strong> against the taxi's{" "}
          {fmtEur(median.taxiEur)}.{" "}
          <Chip href="https://www.berlin.de/en/public-transportation/1756978-2913840-taxi-phone-numbers-fares-rules.en.html">
            Taxitarif 2026
          </Chip>
        </p>
        <p>
          But Berlin is not Austin. Past{" "}
          <strong>{costs.breakEvens.bvgCheaperThanCybercabFromKm} km</strong>, a
          single ticket on BVG — Berlin's transit network — is cheaper; and for
          holders of the Deutschlandticket, the €58-a-month flat-rate transit
          pass, every U-Bahn ride is already paid for. A car you already own
          costs almost nothing extra per trip. One honest point for the
          Cybercab: its fare covers the vehicle — two people ride for €
          {median.cybercabEur.toFixed(2)} total, while BVG charges per person.
        </p>
      </div>
      <FareCurves costs={costs} demand={demand} />
      <table className="data">
        <caption className="caption" style={{ textAlign: "left", marginBottom: "0.4rem" }}>
          The median trip ({median.km} km), priced five ways
        </caption>
        <thead>
          <tr>
            <th>Cybercab</th>
            <th>Berlin taxi</th>
            <th>BVG single</th>
            <th>Own car (full)</th>
            <th>Own car (fuel)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{fmtEur(median.cybercabEur)}</td>
            <td>{fmtEur(median.taxiEur)}</td>
            <td>{fmtEur(median.bvgEur)}</td>
            <td>{fmtEur(median.carFullEur)}</td>
            <td>{fmtEur(median.carMarginalEur)}</td>
          </tr>
        </tbody>
      </table>
      <div className="prose">
        <p className="caption">
          “Own car, full” spreads purchase, insurance and parking over every km
          (€0.40/km); “fuel” is the marginal cost drivers actually feel. The
          honest comparison for “should I sell my car?” is the full cost — for
          “should I drive tonight?” it's fuel.
        </p>
      </div>
    </Section>
  );
}

export function FindingBusiness({ report }: { report: ReportData }) {
  const { day, consumerSurplus: cs } = report.economics;
  return (
    <Section
      id="business"
      eyebrow="Finding 03 · The business"
      title="The fare can halve and Tesla still wins"
    >
      <div className="prose">
        <p>
          Run the operator's books on the simulated evening: {cs.servedRides}{" "}
          rides at the Austin tariff earn {fmtEur(cs.cybercabTotalEur)}, while
          electricity for the whole fleet costs about{" "}
          {fmtEur(report.economics.perFleet.find((f) => f.fleet === day.fleet)?.energyCostEur ?? 0)}.
          Energy is ~3% of revenue; there is no driver to pay. Riders
          simultaneously save <strong>{fmtPct(cs.riderSavingsShare)}</strong>{" "}
          versus the same trips in a Berlin taxi.{" "}
          <Chip href="#methods" sim>
            fleet {day.fleet} economics
          </Chip>
        </p>
        <p>
          Stretch that evening across a full day — the honest label is
          <em> estimate</em>: it assumes the fleet stays this busy whenever
          demand exists — and each cab clears roughly{" "}
          <strong>{fmtEur(day.marginPerCabEur)} a day</strong>. A $30,000
          Cybercab would pay for itself in about{" "}
          <strong>{Math.round(day.paybackDays)} days</strong>. Halve the fare:
          ~{Math.round(day.sensitivity.fareX05.paybackYears * 365)} days.
          Overstaff to {day.sensitivity.worstFleet?.fleet ?? 30} cabs: ~
          {Math.round((day.sensitivity.worstFleet?.paybackYears ?? 0.37) * 365)}{" "}
          days.
        </p>
      </div>
      <div className="stat-row">
        <Stat value={`~${Math.round(day.ridesPerCab)}`} label="rides / cab / day (est.)" />
        <Stat value={fmtEur(day.revenuePerCabEur)} label="revenue / cab / day" gold />
        <Stat value={fmtEur(day.energyCostPerCabEur)} label="energy / cab / day" />
        <Stat value={`~${Math.round(day.paybackDays)} days`} label="cab pays for itself" gold />
      </div>
      {report.dayMeasured && (
        <div className="prose">
          <p>
            We then <strong>simulated the entire day twice</strong> instead of
            extrapolating: all {fmtInt(report.dayMeasured.requests)} of the
            corridor's daily car trips, served once by the evening-knee fleet
            and once by {report.dayMeasured.meta.fleet} cabs. The result is the
            operator's dial laid bare: with {report.dayMeasured.meta.fleet}{" "}
            cabs, riders wait {report.dayMeasured.waitP50Min} minutes at the
            median and a cab pays back in{" "}
            <strong>~{Math.round(report.dayMeasured.paybackDays ?? 0)} days</strong>
            {report.dayMeasuredEveningFleet && (
              <>
                ; run lean with {report.dayMeasuredEveningFleet.meta.fleet} and
                the same demand still gets served — but the median wait balloons
                to {report.dayMeasuredEveningFleet.waitP50Min} minutes while
                payback halves to ~
                {Math.round(report.dayMeasuredEveningFleet.paybackDays ?? 0)}{" "}
                days
              </>
            )}
            . Service quality is a choice against profit speed — and both
            measured paybacks are slower than the hourly extrapolation above,
            because a day is not twelve rush hours.{" "}
            <Chip href="#methods" sim>
              2 measured days
            </Chip>
          </p>
        </div>
      )}
      <div className="prose">
        <p>
          The binding constraint is not price — it is <strong>utilization</strong>:
          keeping a two-seater busy outside the evening peak, through charging
          stops, dead hours and winter. That is why the fare war (Finding 02)
          is affordable for the operator and existential for the taxi trade.
        </p>
      </div>
    </Section>
  );
}

export function FindingAccess({ report }: { report: ReportData }) {
  const p = report.demand.persons;
  const bands = ["<18", "18-29", "30-44", "45-64", "65-79", "80+"];
  const max = Math.max(...bands.map((b) => p.byAgeBand[b] ?? 0));
  const cantDrive = p.seniors65 + p.minors;
  return (
    <Section id="access" eyebrow="Finding 04 · Who gains" title="The passengers a driver's seat excludes">
      <div className="prose">
        <p>
          A robotaxi's honest unique selling point is not price — it is that{" "}
          <strong>nobody has to drive it</strong>. Of the{" "}
          {fmtInt(p.unique)} corridor residents in the twin (
          {fmtInt(p.unique * 100)} real people),{" "}
          <strong>{fmtInt(cantDrive)} are under 18 or over 65</strong> — the ages
          where licenses fade or don't exist yet. Berlin already has the lowest
          car ownership in Germany; a driverless option is a real mobility gain
          for exactly these groups.{" "}
          <Chip href="https://www.dbresearch.com/PROD/IE-PROD/PROD0000000000529231/More_and_older_cars_in_Germany.xhtml">
            DB Research
          </Chip>
        </p>
      </div>
      <Figure title="Who lives (and moves) here" sub="corridor residents by age · 1% twin">
        <svg viewBox="0 0 720 180" role="img" aria-label="Residents by age band">
          {bands.map((b, i) => {
            const n = p.byAgeBand[b] ?? 0;
            const w = (n / max) * 470;
            const highlight = b === "<18" || b === "65-79" || b === "80+";
            return (
              <g key={b} transform={`translate(0, ${i * 29 + 4})`}>
                <text x={78} y={16} textAnchor="end" className="tick-label" fill="#98a4ba">
                  {b}
                </text>
                <rect x={88} y={2} width={Math.max(3, w)} height={19} rx={4}
                  fill={highlight ? "#f5c518" : "#33415e"} opacity={highlight ? 0.92 : 1} />
                <text x={94 + w} y={16} className="series-label" fill="#e8ecf4">
                  {fmtInt(n)}
                </text>
              </g>
            );
          })}
        </svg>
      </Figure>
      <div className="prose">
        <p>
          The flip side: those same riders are today's{" "}
          <strong>bus passengers and cyclists</strong>, not today's drivers. Every
          senior the Cybercab wins is likely won <em>from BVG</em> — which brings
          us to the catch.
        </p>
      </div>
    </Section>
  );
}
