// The 30-second auto-tour: scripted beats over the live sim.
// Each beat sets replay state (speed/follow) and shows one caption.

import { replayStore } from "../map/replayStore";
import type { ReportData } from "../lib/data";
import { storyFleet } from "../brief/ActThree";
import { fmtEur, fmtPct } from "../lib/format";

export interface TourBeat {
  ms: number;
  en: string;
  de: string;
  follow: boolean;
  speed: number;
}

export function buildTour(report: ReportData): TourBeat[] {
  const knee = storyFleet(report.sweep.byFleet);
  const median = report.costs.priceTable[0];
  const rdf = report.sweepReinickendorf?.byFleet.find(
    (r) => r.servedShare.min >= 0.99 && r.waitP50Min.mean <= 10,
  );
  return [
    {
      ms: 4200,
      en: "One Berlin evening, simulated street by street — every dot a synthetic Berliner.",
      de: "Ein Berliner Abend, Straße für Straße simuliert — jeder Punkt ein synthetischer Berliner.",
      follow: false,
      speed: 180,
    },
    {
      ms: 4600,
      en: `125 people hail a Cybercab. ${knee.fleet} cabs respond — ride along.`,
      de: `125 Menschen rufen ein Cybercab. ${knee.fleet} Wagen antworten — fahren Sie mit.`,
      follow: true,
      speed: 180,
    },
    {
      ms: 4200,
      en: `Median wait: ${Math.round(knee.waitP50Min.mean)} minutes — the level of Tesla's real Austin service.`,
      de: `Mediane Wartezeit: ${Math.round(knee.waitP50Min.mean)} Minuten — das Niveau von Teslas echtem Austin-Betrieb.`,
      follow: true,
      speed: 180,
    },
    {
      ms: 4200,
      en: `The median fare: ${fmtEur(median.cybercabEur)} — a Berlin taxi charges ${fmtEur(median.taxiEur)}.`,
      de: `Der mediane Fahrpreis: ${fmtEur(median.cybercabEur)} — ein Berliner Taxi verlangt ${fmtEur(median.taxiEur)}.`,
      follow: false,
      speed: 300,
    },
    {
      ms: 4200,
      en: `The catch: empty cabs add ${fmtPct(knee.emptyShare.mean / (1 - knee.emptyShare.mean))} vehicle-km — the congestion case against.`,
      de: `Der Haken: Leerfahrten erzeugen ${fmtPct(knee.emptyShare.mean / (1 - knee.emptyShare.mean))} zusätzliche Fahrzeug-km — das Argument dagegen.`,
      follow: false,
      speed: 300,
    },
    {
      ms: 4400,
      en: "Twelve measured days: the comfort fleet pays back in 102 days at 4-minute waits. Lean pays back in 52, but riders wait 21.",
      de: "Zwölf simulierte Tage: die Komfortflotte amortisiert in 102 Tagen bei 4 Minuten Wartezeit. Spar-Variante: 52 Tage, aber 21 Minuten warten.",
      follow: false,
      speed: 300,
    },
    {
      ms: 4200,
      en: rdf
        ? `Aimed at a transit-poor district, ${rdf.fleet} cabs serve 100%. Results below ↓`
        : "Every number on this page is a completed SUMO run. Results below ↓",
      de: rdf
        ? `Im ÖPNV-armen Außenbezirk genügen ${rdf.fleet} Wagen für 100%. Ergebnisse unten ↓`
        : "Jede Zahl auf dieser Seite ist ein abgeschlossener SUMO-Lauf. Ergebnisse unten ↓",
      follow: false,
      speed: 300,
    },
  ];
}

export function applyBeat(beat: TourBeat) {
  replayStore.set({ playing: true, follow: beat.follow, speed: beat.speed });
}
