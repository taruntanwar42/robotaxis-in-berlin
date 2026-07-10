import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReportData } from "../lib/data";
import { fmtClock, fmtEur, fmtPct } from "../lib/format";
import { replayStore } from "../map/replayStore";
import { storyFleet } from "../brief/ActThree";
import { applyBeat, buildTour } from "./tour";
import { S, type Lang } from "./strings";
import { MapStage, type Scene } from "../map/MapStage";

function useReplay() {
  return useSyncExternalStore(replayStore.subscribe, replayStore.get);
}

import type { ReplayData } from "../lib/data";

const FARE_BASE_EUR = 3.0 * 0.92;
const FARE_PER_KM_EUR = (1.4 / 1.60934) * 0.92;

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function SimHud({
  replay,
  lang,
  hideTicker,
  district,
  setDistrict,
  hasRdf,
}: {
  replay: ReplayData;
  lang: Lang;
  hideTicker: boolean;
  district: District;
  setDistrict: (d: District) => void;
  hasRdf: boolean;
}) {
  const { timeSec, playing, follow } = useReplay();
  const served = replay.riders.filter((r) => r.dropoffSec !== null && timeSec >= r.dropoffSec).length;
  const waiting = replay.riders.filter(
    (r) => timeSec >= r.departSec && (r.pickupSec === null || timeSec < r.pickupSec),
  ).length;
  // latest pickup: the sim narrating itself (straight-line km -> fare floor)
  const latest = replay.riders
    .filter(
      (r) =>
        r.pickupSec !== null &&
        r.pickupSec <= timeSec &&
        timeSec < (r.dropoffSec ?? Infinity) + 90 &&
        haversineKm(r.o, r.d) >= 0.8,
    )
    .sort((a, b) => b.pickupSec! - a.pickupSec!)[0];
  const ticker = latest
    ? (() => {
        const waitMin = Math.max(0, Math.round((latest.pickupSec! - latest.departSec) / 60));
        const km = haversineKm(latest.o, latest.d);
        const fare = FARE_BASE_EUR + FARE_PER_KM_EUR * km;
        return lang === "de"
          ? `${fmtClock(latest.pickupSec!)} · abgeholt nach ${waitMin} Min · ~${km.toFixed(1)} km · ~€${fare.toFixed(2)}`
          : `${fmtClock(latest.pickupSec!)} · picked up after ${waitMin} min · ~${km.toFixed(1)} km · ~€${fare.toFixed(2)}`;
      })()
    : null;
  return (
    <div className="op-hud" role="group" aria-label="Simulation status">
      <span className="op-hud-clock">{fmtClock(timeSec)}</span>
      <span className="op-hud-stat">
        <b>{served}</b>/{replay.riders.length} {S.served[lang]}
      </span>
      <span className="op-hud-stat">
        <b>{waiting}</b> {S.waiting[lang]}
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
        {playing ? S.pause[lang] : S.play[lang]}
      </button>
      <button className="btn" aria-pressed={follow} onClick={() => replayStore.set({ follow: !follow, playing: true })}>
        {follow ? S.overview[lang] : S.ride[lang]}
      </button>
      {hasRdf && (
        <span className="op-hud-districts" role="tablist" aria-label="District">
          <button
            className="btn"
            role="tab"
            aria-selected={district === "moabit"}
            aria-pressed={district === "moabit"}
            onClick={() => setDistrict("moabit")}
          >
            Moabit
          </button>
          <button
            className="btn"
            role="tab"
            aria-selected={district === "reinickendorf"}
            aria-pressed={district === "reinickendorf"}
            onClick={() => setDistrict("reinickendorf")}
          >
            Reinickendorf
          </button>
        </span>
      )}
      <span className="op-legend" aria-hidden="true">
        <i className="sw sw-cab" /> {lang === "de" ? "Cab" : "cab"}
        <i className="sw sw-wait" /> {lang === "de" ? "wartet" : "waiting"}
        <i className="sw sw-traffic" /> {lang === "de" ? "Verkehr" : "traffic"}
      </span>
      {ticker && !hideTicker && (
        <span className="op-ticker" role="status">
          {ticker}
        </span>
      )}
    </div>
  );
}

type District = "moabit" | "reinickendorf";

export function OnePager({ report }: { report: ReportData }) {
  const [district, setDistrict] = useState<District>("moabit");
  const hasRdf = report.replayReinickendorf !== null && report.reinickendorfArea !== null;
  const scene: Scene =
    district === "reinickendorf" && hasRdf
      ? {
          area: report.reinickendorfArea!,
          replay: report.replayReinickendorf!,
          trafficUrl: "data/report/traffic-reinickendorf.json",
        }
      : {
          area: report.serviceArea,
          replay: report.replay,
          trafficUrl: "data/report/traffic.json",
        };
  const [lang, setLang] = useState<Lang>(() =>
    (localStorage.getItem("op-lang") as Lang) ??
    (navigator.language.startsWith("de") ? "de" : "en"),
  );
  useEffect(() => localStorage.setItem("op-lang", lang), [lang]);

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

  // ---- auto-tour ----
  const [tourStep, setTourStep] = useState<number>(-1);
  const tourTimer = useRef<number | null>(null);
  const beats = useRef(buildTour(report));

  const stopTour = () => {
    if (tourTimer.current) window.clearTimeout(tourTimer.current);
    tourTimer.current = null;
    setTourStep(-1);
    replayStore.set({ follow: false });
  };

  const runBeat = (i: number) => {
    if (i >= beats.current.length) {
      stopTour();
      document.querySelector(".op-results")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    setTourStep(i);
    applyBeat(beats.current[i]);
    tourTimer.current = window.setTimeout(() => runBeat(i + 1), beats.current[i].ms);
  };

  const startTour = () => {
    setDistrict("moabit"); // the tour is scripted over the corridor evening
    replayStore.set({ timeSec: report.replay.meta.startSec + 240, playing: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    runBeat(0);
  };

  useEffect(() => () => stopTour(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="op">
      <MapStage scene={scene} section="experiment" />
      <section className={tourStep >= 0 ? "op-hero touring" : "op-hero"}>
        <div className="op-hero-card">
          <p className="eyebrow">{S.eyebrow[lang]}</p>
          <h1>
            {S.titlePre[lang]}{" "}
            <span style={{ color: "var(--gold-text)" }}>
              {district === "reinickendorf"
                ? lang === "de"
                  ? "Reinickendorf kämen"
                  : "Reinickendorf"
                : S.titleCity[lang]}
            </span>
          </h1>
          <p className="op-lede">{S.lede[lang]}</p>
          <div className="op-chiprow">
            <button className="op-chip tour" onClick={tourStep >= 0 ? stopTour : startTour}>
              {tourStep >= 0 ? S.tourStop[lang] : S.tourStart[lang]}
            </button>
            <a className="op-chip link" href="#deep">
              {S.chipBrief[lang]}
            </a>
            <button
              className="op-chip"
              style={{ cursor: "pointer" }}
              onClick={() => setLang(lang === "en" ? "de" : "en")}
              aria-label="Sprache wechseln / switch language"
            >
              {lang === "en" ? "DE" : "EN"}
            </button>
          </div>
        </div>
        {tourStep >= 0 && (
          <div className="op-tour-caption" role="status" aria-live="polite" key={tourStep}>
            <span className="op-tour-n">
              {tourStep + 1}/{beats.current.length}
            </span>
            {beats.current[tourStep][lang]}
          </div>
        )}
        <SimHud
          replay={scene.replay}
          lang={lang}
          hideTicker={tourStep >= 0}
          district={district}
          setDistrict={(d) => {
            stopTour();
            setDistrict(d);
          }}
          hasRdf={hasRdf}
        />
      </section>

      <section className="op-body">
        <div className="op-ansatz">
          {S.ansatz[lang].map((s) => (
            <div key={s.n} className="op-step">
              <span className="op-step-n">{s.n}</span>
              <b>{s.t}</b>
              <p>{s.l}</p>
            </div>
          ))}
        </div>

        <h2 className="op-h2">{S.resultsH[lang]}</h2>
        <p className="op-key caption">
          {lang === "de"
            ? "grau = Ergebnis · rot = Gegenseite · gold = Empfehlung"
            : "grey = result · red = the case against · gold = where to aim"}
        </p>
        <div className="op-results">
          <div className="op-card">
            <b>{knee.fleet} {S.cabs[lang]}</b>
            <p>
              {lang === "de"
                ? `bedienen ${fmtPct(knee.servedShare.mean)} der abendlichen Autofahrten bei ${Math.round(knee.waitP50Min.mean)} Min. medianer Wartezeit — Austin-Niveau`
                : `serve ${fmtPct(knee.servedShare.mean)} of the evening's car trips at ${Math.round(knee.waitP50Min.mean)} min median wait — Austin-grade`}
            </p>
          </div>
          <div className="op-card">
            <b>{fmtEur(median.cybercabEur)}</b>
            <p>
              {lang === "de"
                ? `für die mediane Fahrt statt ${fmtEur(median.taxiEur)} im Berliner Taxi — das Taxi verliert auf jeder Distanz`
                : `for the median trip vs ${fmtEur(median.taxiEur)} in a Berlin taxi — the taxi loses at every distance`}
            </p>
          </div>
          <div className="op-card">
            <b>
              ~{Math.round(report.dayMeasured?.paybackDays ?? day.paybackDays)}{" "}
              {lang === "de" ? "Tage" : "days"}
            </b>
            <p>
              {report.dayMeasured
                ? lang === "de"
                  ? `bis sich ein 30.000-$-Cab amortisiert — ein komplett simulierter Tag, Flotte ${report.dayMeasured.meta.fleet}: ${report.dayMeasured.waitP50Min} Min. Wartezeit. Kleinere Flotte: halbe Zeit — auf Kosten der Fahrgäste`
                  : `for a $30k cab to pay for itself — a fully simulated day, fleet ${report.dayMeasured.meta.fleet}: ${report.dayMeasured.waitP50Min} min waits. Run leaner and payback halves — at the riders’ expense`
                : lang === "de"
                  ? "bis sich ein 30.000-$-Cab zu Austin-Tarifen amortisiert — Energie ist ~3% des Umsatzes (Schätzung, Annahmen publiziert)"
                  : "for a $30k cab to pay for itself at Austin fares — energy is ~3% of revenue (estimate, assumptions published)"}
            </p>
          </div>
          <div className="op-card warn">
            <b>+{fmtPct(emptyA)}</b>
            <p>
              {lang === "de"
                ? "Fahrzeug-km selbst wenn nur Autofahrer umsteigen — Leerfahrten sind gemessen, nicht geschätzt. Realistische Adoption: 6× schlimmer"
                : "vehicle-km even if only drivers switch — deadheading is measured, not estimated. Realistic adoption: 6× worse"}
            </p>
          </div>
          <div className="op-card warn">
            <b>≤5% {lang === "de" ? "gespart" : "saved"}</b>
            <p>
              {lang === "de"
                ? "durch Pooling — zwei Sitze und 2-km-Fahrten überlappen kaum (21 Läufe mit geteilter Disposition)"
                : "by pooling — two seats and 2-km rides barely overlap (21 shared-dispatch runs)"}
            </p>
          </div>
          {rdf && (
            <div className="op-card gold">
              <b>{rdf.fleet} {S.cabs[lang]} · {fmtPct(rdf.servedShare.mean)}</b>
              <p>
                {lang === "de"
                  ? `bedienen das ÖPNV-arme Reinickendorf bei ${Math.round(rdf.waitP50Min.mean)} Min. Wartezeit. Robotaxis gehören in Lücken, nicht in Zentren.`
                  : `serve transit-poor Reinickendorf at ${Math.round(rdf.waitP50Min.mean)}-minute waits. Aim robotaxis at gaps, not centers.`}
              </p>
            </div>
          )}
        </div>

        <div className="op-explorer">
          <label className="caption" htmlFor="op-fleet">
            {S.tryFleet[lang]}
          </label>
          <input
            id="op-fleet"
            type="range"
            min={0}
            max={rows.length - 1}
            value={fleetIdx}
            onChange={(e) => setFleetIdx(Number(e.target.value))}
          />
          <span className="op-exp-val">
            {row.fleet} {S.cabs[lang]}
          </span>
          <span className="op-exp-stat">
            {fmtPct(row.servedShare.mean)} {S.expServed[lang]}
          </span>
          <span className="op-exp-stat">
            {Math.round(row.waitP50Min.mean)} {S.expWait[lang]}
          </span>
          <span className="op-exp-stat">
            {fmtPct(row.emptyShare.mean)} {S.expEmpty[lang]}
          </span>
          <span className="caption">{S.expNote[lang]}</span>
        </div>

        <footer className="op-footer">
          <span>{S.footer1[lang]}</span>
          <span className="op-badges">
            MATSim Open Berlin · BeST scenario (CC-BY) · SUMO 1.27 · 78 recorded runs ·{" "}
            <a href="https://github.com/taruntanwar42/robotaxis-in-berlin">GitHub</a> ·{" "}
            <a href="#deep">{S.fullBriefLink[lang]}</a> ·{" "}
            <a
              href="#print"
              onClick={(e) => {
                e.preventDefault();
                window.print();
              }}
            >
              {S.print[lang]}
            </a>
          </span>
        </footer>
      </section>
    </div>
  );
}
