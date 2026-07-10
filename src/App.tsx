import { useEffect, useMemo, useState } from "react";
import { OnePager } from "./onepager/OnePager";
import { loadReport, type ReportData } from "./lib/data";
import { useActiveSection } from "./lib/scroll";
import { LineRail } from "./ui/primitives";
import { MapStage } from "./map/MapStage";
import { Hero, Place, Today } from "./brief/ActOne";
import { Experiment, Vehicle } from "./brief/ActTwo";
import { FindingAccess, FindingBusiness, FindingFare, FindingService } from "./brief/ActThree";
import { Catch, Methods, Verdict } from "./brief/ActFour";
import { CompareKiez } from "./brief/CompareKiez";

const STATIONS = [
  { id: "hero", name: "Frage" },
  { id: "place", name: "Der Kiez" },
  { id: "today", name: "Heute" },
  { id: "vehicle", name: "Das Auto" },
  { id: "experiment", name: "Simulation" },
  { id: "service", name: "Befund 1" },
  { id: "fare", name: "Befund 2" },
  { id: "business", name: "Befund 3" },
  { id: "access", name: "Befund 4" },
  { id: "catch", name: "Der Haken" },
  { id: "where", name: "Wohin?" },
  { id: "verdict", name: "Urteil" },
  { id: "methods", name: "Methode" },
];

function useDeepMode(): boolean {
  const [deep, setDeep] = useState(() => window.location.hash === "#deep");
  useEffect(() => {
    const onHash = () => {
      const isDeep = window.location.hash === "#deep";
      setDeep(isDeep);
      if (isDeep) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return deep;
}

export default function App() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deep = useDeepMode();
  const ids = useMemo(() => STATIONS.map((s) => s.id), []);
  const active = useActiveSection(ids, report !== null && deep);

  useEffect(() => {
    loadReport().then(setReport).catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "20vh 2rem", textAlign: "center" }}>
        <p className="eyebrow">Something is missing</p>
        <p>
          The report data failed to load ({error}). Reload the page — everything
          here is static, so a second try usually does it.
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ padding: "45vh 2rem 0", textAlign: "center" }}>
        <p className="eyebrow" aria-live="polite">
          loading the evidence …
        </p>
      </div>
    );
  }

  if (!deep) {
    return <OnePager report={report} />;
  }

  return (
    <>
      <MapStage
        scene={{
          area: report.serviceArea,
          replay: report.replay,
          origins: report.demand.evening.origins,
          trafficUrl: "data/report/traffic.json",
        }}
        section={active}
      />
      <LineRail stations={STATIONS} active={active} />
      <a
        className="op-chip link"
        href="#"
        onClick={() => window.scrollTo(0, 0)}
        style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 30, textDecoration: "none" }}
      >
        ← 1-minute version
      </a>
      <main className="brief">
        <Hero />
        <Place report={report} />
        <Today report={report} />
        <Vehicle />
        <Experiment report={report} />
        <FindingService report={report} />
        <FindingFare report={report} />
        <FindingBusiness report={report} />
        <FindingAccess report={report} />
        <Catch report={report} />
        <CompareKiez report={report} />
        <Verdict report={report} />
        <Methods report={report} />
      </main>
    </>
  );
}
