export type ExperiencePhase = "cover" | "running" | "results"

export type ShiftReportData = {
  ridesServed?: number
  totalDemand?: number
  peopleMoved?: number
  medianWaitSec?: number
  avgWaitSec?: number
  fleetKm?: number
  emptySharePercent?: number
}

export type FleetBoardRow = {
  id: string
  state?: string | null
  speedKph?: number | null
  requestId?: string | null
}

export type DispatchFeedEntry = {
  key: string
  atSec: number
  status: string
  cab?: string | null
  mode?: string | null
  waitSec?: number | null
}

type CybercabExperienceProps = {
  phase: ExperiencePhase
  clock: string
  ridesServed?: number
  openRequests?: number
  fleetRows?: FleetBoardRow[]
  feed?: DispatchFeedEntry[]
  fleetSize: number
  isPreparing: boolean
  isUnavailable: boolean
  report: ShiftReportData | null
  onStart: () => void
  onReplay: () => void
}

type IntroCard = {
  kicker: string
  title: string
  body: string
  imageSrc?: string
}

const INTRO_CARDS: IntroCard[] = [
  {
    kicker: "Fleet simulation",
    title: "Robotaxis in Berlin",
    body: "What if Tesla's Cybercab drove Berlin? A driverless fleet takes on one evening rush hour in the west of the city.",
  },
  {
    kicker: "Real city, real demand",
    title: "Built on Berlin's own data",
    body: "The streets come from Berlin's SUMO traffic network. The riders come from TU Berlin's MATSim model of the city — every request is a synthetic Berliner's actual evening trip.",
  },
  {
    kicker: "Your shift",
    title: "18:00. Ten cabs. One hour.",
    body: "Dispatch runs itself: cabs pick up riders, reposition toward demand, and park between trips. Watch the fleet work Charlottenburg, Moabit and Tiergarten.",
  },
]

export function CybercabExperience({
  phase,
  clock,
  ridesServed,
  openRequests,
  fleetRows,
  feed,
  fleetSize,
  isPreparing,
  isUnavailable,
  report,
  onStart,
  onReplay,
}: CybercabExperienceProps) {
  return (
    <div className="experience-layer">
      {phase === "cover" ? (
        <div className="veil veil-cover">
          {/* All three cards at once, one click total: Start. */}
          <section className="cover-panel" aria-label="Robotaxis in Berlin">
            <div className="cover-panel-grid">
              {INTRO_CARDS.map((card) => (
                <article key={card.title} className="cover-panel-card">
                  {card.imageSrc ? (
                    <img className="cover-media" src={card.imageSrc} alt="" />
                  ) : null}
                  <span className="kicker">{card.kicker}</span>
                  <h1>{card.title}</h1>
                  <p>{card.body}</p>
                </article>
              ))}
            </div>
            {isUnavailable ? (
              <div className="cover-unavailable" role="status">
                The simulation backend is waking up. Give it a minute, then reload.
              </div>
            ) : (
              <button
                type="button"
                className="gold-button gold-button-glow cover-start"
                onClick={onStart}
                disabled={isPreparing}
              >
                {isPreparing ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    Preparing
                  </>
                ) : (
                  "Start the shift"
                )}
              </button>
            )}
            <span className="cover-microline">
              18:00 – 19:00 · runs by itself · about 2 minutes
            </span>
          </section>
        </div>
      ) : null}

      {phase === "running" ? (
        <>
          <div className="hud" role="status" aria-label="Shift status">
            <span className="hud-clock">{clock}</span>
            <span className="hud-dot" aria-hidden="true" />
            <span className="hud-counter">
              <strong>{ridesServed ?? 0}</strong> rides served
            </span>
            {typeof openRequests === "number" ? (
              <>
                <span className="hud-dot" aria-hidden="true" />
                <span className="hud-counter">
                  <strong>{openRequests}</strong> waiting
                </span>
              </>
            ) : null}
          </div>

          {fleetRows && fleetRows.length > 0 ? (
            <aside className="fleet-board" aria-label="Fleet status">
              <header className="panel-header">Fleet</header>
              <ul>
                {fleetRows.map((row) => (
                  <li key={row.id} className="fleet-row">
                    <span className={`fleet-state-dot state-${stateTone(row.state)}`} aria-hidden="true" />
                    <span className="fleet-label">{cabLabel(row.id)}</span>
                    <span className="fleet-status">{stateLabel(row.state)}</span>
                    <span className="fleet-speed">
                      {typeof row.speedKph === "number" && row.speedKph > 1
                        ? `${Math.round(row.speedKph)} km/h`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}

          <aside className="map-legend" aria-label="Map legend">
            <ul>
              <li>
                <span className="legend-swatch legend-pulse" aria-hidden="true" />
                New ride request
              </li>
              <li>
                <span className="legend-swatch legend-dot-open" aria-hidden="true" />
                Rider waiting for a cab
              </li>
              <li>
                <span className="legend-swatch legend-line-pickup" aria-hidden="true" />
                Cab driving to pickup
              </li>
              <li>
                <span className="legend-swatch legend-line-ride" aria-hidden="true" />
                Ride to destination
              </li>
            </ul>
          </aside>

          {feed && feed.length > 0 ? (
            <aside className="dispatch-feed" aria-label="Dispatch feed">
              <header className="panel-header">Dispatch</header>
              <ul>
                {feed.slice(0, 7).map((entry) => (
                  <li key={entry.key} className={`feed-row tone-${feedTone(entry.status)}`}>
                    <span className="feed-time">{formatClock(entry.atSec)}</span>
                    <span className="feed-text">{feedText(entry)}</span>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </>
      ) : null}

      {phase === "results" ? (
        <div className="veil veil-report">
          <section className="report-card" aria-label="Shift report">
            <span className="kicker">Shift report</span>
            <h2>Shift complete</h2>
            <p className="report-subline">
              18:00 – 19:00 · {fleetSize} Cybercabs · Charlottenburg, Moabit &amp; Tiergarten
            </p>
            <div className="report-grid">
              <ReportMetric
                label="Rides served"
                value={fmtCount(report?.ridesServed)}
                sub={report?.totalDemand !== undefined ? `of ${report.totalDemand} requests` : undefined}
              />
              <ReportMetric label="People moved" value={fmtCount(report?.peopleMoved)} />
              <ReportMetric
                label={report?.medianWaitSec !== undefined ? "Median wait" : "Average wait"}
                value={fmtWait(report?.medianWaitSec ?? report?.avgWaitSec)}
              />
              <ReportMetric label="Fleet distance" value={fmtKm(report?.fleetKm)} />
              <ReportMetric label="Empty driving" value={fmtPercent(report?.emptySharePercent)} sub="share of fleet km" />
            </div>
            <button type="button" className="ghost-button" onClick={onReplay}>
              Watch again
            </button>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function cabLabel(id: string) {
  const suffix = id.replace(/^cybercab_/, "")
  return `Cab ${suffix}`
}

function stateLabel(state: string | null | undefined) {
  switch (state) {
    case "en_route_pickup":
      return "To pickup"
    case "with_passenger":
      return "With rider"
    case "roaming":
      return "Roaming"
    case "staged":
      return "Repositioning"
    case "idle":
      return "Parked"
    case "idle_at_depot":
      return "At depot"
    case "returning_to_depot":
      return "To depot"
    case "offline":
      return "Off duty"
    default:
      return state ? state.replaceAll("_", " ") : "—"
  }
}

function stateTone(state: string | null | undefined) {
  switch (state) {
    case "with_passenger":
      return "riding"
    case "en_route_pickup":
      return "pickup"
    case "roaming":
    case "staged":
      return "moving"
    case "returning_to_depot":
    case "idle_at_depot":
    case "offline":
      return "depot"
    default:
      return "parked"
  }
}

function feedTone(status: string) {
  switch (status) {
    case "waiting":
      return "open"
    case "assigned":
      return "assigned"
    case "onboard":
      return "onboard"
    case "completed":
      return "done"
    case "expired":
    case "rejected":
      return "missed"
    default:
      return "open"
  }
}

function feedText(entry: DispatchFeedEntry) {
  const cab = entry.cab ? cabLabel(entry.cab) : null
  switch (entry.status) {
    case "waiting":
      return entry.mode ? `New request (usually rides ${modeLabel(entry.mode)})` : "New ride request"
    case "assigned":
      return cab ? `${cab} assigned` : "Cab assigned"
    case "onboard":
      return cab ? `Picked up by ${cab}` : "Rider picked up"
    case "completed":
      return typeof entry.waitSec === "number"
        ? `Dropped off · waited ${Math.round(entry.waitSec)}s`
        : "Dropped off"
    case "expired":
      return "Request expired unserved"
    case "rejected":
      return "Request declined (shift ending)"
    default:
      return entry.status.replaceAll("_", " ")
  }
}

function modeLabel(mode: string) {
  switch (mode) {
    case "car":
      return "by car"
    case "ride":
      return "as passenger"
    case "pt":
      return "public transit"
    case "bike":
      return "by bike"
    case "walk":
      return "on foot"
    default:
      return mode
  }
}

function formatClock(simSec: number) {
  const hours = Math.floor(simSec / 3600) % 24
  const minutes = Math.floor((simSec % 3600) / 60)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function ReportMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="report-metric">
      <span className="report-metric-label">{label}</span>
      <strong className="report-metric-value">{value}</strong>
      {sub ? <span className="report-metric-sub">{sub}</span> : null}
    </div>
  )
}

function fmtCount(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "--"
}

function fmtWait(seconds: number | undefined) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    return "--"
  }
  if (seconds < 90) {
    return `${Math.round(seconds)} s`
  }
  return `${(seconds / 60).toFixed(1)} min`
}

function fmtKm(km: number | undefined) {
  if (typeof km !== "number" || !Number.isFinite(km)) {
    return "--"
  }
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`
}

function fmtPercent(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} %` : "--"
}
