import type { ReportData, SweepRow } from "../lib/data";
import { fmtEur, fmtInt, fmtPct } from "../lib/format";
import { Chip, Section } from "../ui/primitives";
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
          The corridor's evening hour generates{" "}
          <strong>{fmtInt(rows[0].requests)} requests</strong> in the twin
          (≈ {fmtInt(rows[0].requests * 100)} real). We reran the same evening
          with seven fleet sizes and three traffic conditions each.{" "}
          <Chip href="#methods" sim>
            21 SUMO runs
          </Chip>
        </p>
        <p>
          A fleet of {smallest.fleet} drowns: median waits of{" "}
          {Math.round(smallest.waitP50Min.mean)} minutes and{" "}
          {fmtPct(1 - smallest.servedShare.mean)} of riders never picked up. It
          takes <strong>{knee.fleet} cabs</strong> — one per{" "}
          {Math.round(knee.requests / knee.fleet)} requests — before waits reach{" "}
          <strong>{Math.round(knee.waitP50Min.mean)} minutes</strong> and{" "}
          {fmtPct(knee.servedShare.mean)} of the hour is served. That is the same
          league as Tesla's real Austin service today.
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
      title="Cheaper than any taxi. Not cheaper than the U-Bahn."
    >
      <div className="prose">
        <p>
          Apply Tesla's real Austin tariff to Berlin distances and the taxi
          trade dies on this chart: a Cybercab undercuts the regulated Berlin
          taxi at <strong>every distance</strong> — the typical{" "}
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
          single BVG ticket is cheaper — and for the half of Berliners holding a
          Deutschlandticket, every U-Bahn ride is already paid for. And a car
          you already own costs almost nothing extra per trip.
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
            <td className="best">{fmtEur(median.cybercabEur)}</td>
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

export function FindingAccess({ report }: { report: ReportData }) {
  const p = report.demand.persons;
  const bands = ["<18", "18-29", "30-44", "45-64", "65-79", "80+"];
  const max = Math.max(...bands.map((b) => p.byAgeBand[b] ?? 0));
  const cantDrive = p.seniors65 + p.minors;
  return (
    <Section id="access" eyebrow="Finding 03 · Who gains" title="The passengers a driver's seat excludes">
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
