import { useEffect, useMemo, useState } from "react";
import { loadReport, type ReportData } from "./lib/data";
import { useActiveSection } from "./lib/scroll";
import { LineRail } from "./ui/primitives";
import { MapStage } from "./map/MapStage";
import { Hero, Place, Today } from "./brief/ActOne";
import { Experiment, Vehicle } from "./brief/ActTwo";
import { FindingAccess, FindingBusiness, FindingFare, FindingService } from "./brief/ActThree";
import { Catch, Methods, Verdict } from "./brief/ActFour";

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
  { id: "verdict", name: "Urteil" },
  { id: "methods", name: "Methode" },
];

export default function App() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = useMemo(() => STATIONS.map((s) => s.id), []);
  const active = useActiveSection(ids, report !== null);

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

  return (
    <>
      <MapStage report={report} section={active} />
      <LineRail stations={STATIONS} active={active} />
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
        <Verdict report={report} />
        <Methods report={report} />
      </main>
    </>
  );
}
