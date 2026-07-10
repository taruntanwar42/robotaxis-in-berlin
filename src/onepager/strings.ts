// One-pager copy, EN/DE. The deep brief stays English; the recruiter-facing
// layer speaks both.

export type Lang = "en" | "de";

export const S = {
  eyebrow: { en: "Side project · Berlin · 2026", de: "Eigenprojekt · Berlin · 2026" },
  titlePre: { en: "If Cybercabs came to", de: "Wenn Cybercabs nach" },
  titleCity: { en: "Moabit", de: "Moabit kämen" },
  lede: {
    en: "One Berlin neighborhood, rebuilt in a traffic simulator and handed a Tesla Cybercab fleet. The evening you are watching is one complete SUMO run.",
    de: "Ein Berliner Kiez, im Verkehrssimulator nachgebaut und mit einer Tesla-Cybercab-Flotte ausgestattet. Der Abend, den Sie sehen, ist ein kompletter SUMO-Lauf.",
  },
  chipDemand: { en: "MATSim demand", de: "MATSim-Nachfrage" },
  chipSumo: { en: "SUMO microsimulation", de: "SUMO-Mikrosimulation" },
  chipTariffs: { en: "real 2026 tariffs", de: "echte 2026er-Tarife" },
  chipBrief: { en: "full brief ↓", de: "ausführlicher Bericht ↓" },
  tourStart: { en: "▶ 30-sec tour", de: "▶ 30-Sek.-Tour" },
  tourStop: { en: "stop tour", de: "Tour beenden" },
  served: { en: "served", de: "bedient" },
  waiting: { en: "waiting", de: "warten" },
  pause: { en: "Pause", de: "Pause" },
  play: { en: "Play", de: "Start" },
  ride: { en: "Ride along", de: "Mitfahren" },
  overview: { en: "Overview", de: "Übersicht" },
  ansatz: {
    en: [
      { n: "01", t: "Real demand", l: "7,443 daily trips from TU Berlin's synthetic population (MATSim, 1% twin of the city)" },
      { n: "02", t: "Real streets", l: "The district rebuilt in SUMO: every signal, plus the evening's calibrated traffic" },
      { n: "03", t: "The experiment", l: "Every car trip hails a Cybercab — 78 recorded runs: fleets 4–40, pooled & solo, 2 districts, 12 full days" },
      { n: "04", t: "The case against", l: "Deadheading, pooling limits and transit cannibalization measured with the same rigor as the upside" },
    ],
    de: [
      { n: "01", t: "Echte Nachfrage", l: "7.443 Tageswege aus der synthetischen Bevölkerung der TU Berlin (MATSim, 1%-Zwilling der Stadt)" },
      { n: "02", t: "Echte Straßen", l: "Der Kiez in SUMO nachgebaut: jede Ampel, plus der kalibrierte Abendverkehr" },
      { n: "03", t: "Das Experiment", l: "Jede Autofahrt ruft ein Cybercab — 78 dokumentierte Läufe: Flotten 4–40, mit & ohne Pooling, 2 Bezirke, 12 ganze Tage" },
      { n: "04", t: "Die Gegenseite", l: "Leerfahrten, Pooling-Grenzen und OePNV-Kannibalisierung mit derselben Sorgfalt gemessen wie die Vorteile" },
    ],
  },
  resultsH: { en: "What the simulation says", de: "Was die Simulation sagt" },
  tryFleet: { en: "try a fleet size", de: "Flottengröße testen" },
  cabs: { en: "cabs", de: "Cabs" },
  expServed: { en: "served", de: "bedient" },
  expWait: { en: "min wait", de: "Min. Wartezeit" },
  expEmpty: { en: "empty km", de: "Leer-km" },
  expNote: { en: "each value = a completed SUMO run", de: "jeder Wert = ein abgeschlossener SUMO-Lauf" },
  footer1: {
    en: "Built end-to-end: Python data pipeline → SUMO/libsumo experiments → this page (React, no backend).",
    de: "Komplett selbst gebaut: Python-Datenpipeline → SUMO/libsumo-Experimente → diese Seite (React, ohne Backend).",
  },
  fullBriefLink: { en: "full evidence brief (8 min read)", de: "ausführlicher Bericht (8 Min., Englisch)" },
  print: { en: "print / PDF", de: "Drucken / PDF" },
} as const;
