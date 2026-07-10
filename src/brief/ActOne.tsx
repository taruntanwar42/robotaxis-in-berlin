import type { ReportData } from "../lib/data";
import { MODE_HEX, MODE_LABEL, MODE_ORDER } from "../lib/data";
import { fmtInt, fmtPct, scaled } from "../lib/format";
import { Chip, Section, Stat } from "../ui/primitives";
import { DistanceHistogram, HourlyCurve, ModeSplitBars } from "../charts/DemandCharts";

export function Hero() {
  return (
    <section className="section" id="hero" style={{ minHeight: "92vh", alignItems: "center" }}>
      <div className="section-inner" style={{ maxWidth: "44rem" }}>
        <p className="eyebrow">An evidence brief · Berlin</p>
        <h1
          style={{
            fontSize: "clamp(2.6rem, 7vw, 4.6rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          If Cybercabs came
          to <span style={{ color: "var(--gold)" }}>Moabit</span>
        </h1>
        <p className="lede" style={{ marginTop: "1.4rem", maxWidth: "36rem" }}>
          Tesla's two-seat robotaxi went into production in February 2026. This
          page takes one Berlin neighborhood, rebuilds one of its evenings inside
          a traffic simulation, and measures what a Cybercab fleet would actually
          change — the good and the bad.
        </p>
        <p className="caption" style={{ marginTop: "2.2rem" }}>
          scroll — the map travels with you ↓
        </p>
      </div>
    </section>
  );
}

export function Place({ report }: { report: ReportData }) {
  const { demand } = report;
  const evening = demand.evening;
  return (
    <Section id="place" eyebrow="The place" title="Three Kieze, one evening hour">
      <div className="prose">
        <p>
          The gold outline is the study area: <strong>Charlottenburg, Moabit and
          Tiergarten</strong>, cut along official district boundaries. Every dot is
          one trip that starts here between 18:00 and 19:00 on an ordinary
          weekday — <strong>{fmtInt(evening.trips)} trips</strong> in our copy of
          the city, standing in for {scaled(evening.trips)} real ones.
        </p>
        <p>
          The copy is the{" "}
          <a href="https://github.com/matsim-scenarios/matsim-berlin">
            MATSim Open Berlin model
          </a>
          : a synthetic population that is statistically faithful to how
          Berliners live and move, built by TU Berlin because real trip data is —
          rightly — private. We work with its 1-in-100 sample and say so wherever
          a number depends on it.{" "}
          <Chip href="https://github.com/matsim-scenarios/matsim-berlin">
            MATSim Berlin v6.4
          </Chip>
        </p>
        <div className="caption" style={{ marginTop: "0.6rem" }}>
          {MODE_ORDER.map((m) => (
            <span key={m} style={{ marginRight: "1em", whiteSpace: "nowrap" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: MODE_HEX[m],
                  marginRight: 5,
                }}
              />
              {MODE_LABEL[m]}
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function Today({ report }: { report: ReportData }) {
  const { demand } = report;
  const total = Object.values(demand.modeSplit).reduce((a, b) => a + b, 0);
  const carShare = (demand.modeSplit.car + (demand.modeSplit.ride ?? 0)) / total;
  return (
    <Section id="today" eyebrow="The baseline" title="This neighborhood mostly moves without cars">
      <div className="prose">
        <p>
          Any claim about “impact” needs a baseline. Here is the corridor's
          simulated day: <strong>{fmtInt(total)} resident trips</strong> (
          {scaled(total)} in reality), of which only{" "}
          <strong>{fmtPct(carShare)} touch a private car</strong> — as driver or
          passenger. The rest happen on foot, by bike, or on BVG.
        </p>
      </div>
      <div className="stat-row">
        <Stat value={scaled(total)} label="real trips / day" />
        <Stat value={fmtPct(carShare)} label="by private car" />
        <Stat value={`${demand.medianTripKm} km`} label="median trip" gold />
        <Stat value={fmtInt(demand.persons.unique * 100)} label="people modeled" />
      </div>
      <ModeSplitBars demand={demand} />
      <HourlyCurve demand={demand} />
      <DistanceHistogram demand={demand} />
      <div className="prose">
        <p>
          Keep that <strong>median of {demand.medianTripKm} km</strong> in mind.
          It is the single most important number on this page: half of
          everything this neighborhood does is within a 15-minute walk.
        </p>
      </div>
    </Section>
  );
}
