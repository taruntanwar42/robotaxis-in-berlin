import { useEffect, useMemo, useRef } from "react"

export type ExperiencePhase = "idle" | "running" | "results"

export type ShiftReportCategory = {
  title: string
  rows: Array<{ label: string; value: string }>
}

export type FleetBoardRow = {
  id: string
  state?: string | null
  battery?: number | null
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

export type RiderInfo = {
  status: string
  mode: string | null
  requestedAtSec: number
}

export type OpsSample = {
  t: number
  requested: number
  served: number
  expired: number
  states: Record<string, number>
}

const SIM_SPEED_CHOICES = [10, 20, 60]

const SHIFT_START = 63_900
const SERVICE_START = 64_800
const SERVICE_END = 68_400
const SHIFT_SPAN = SERVICE_END - SHIFT_START

type CybercabExperienceProps = {
  phase: ExperiencePhase
  clock: string
  simSec: number
  ridesServed?: number
  openRequests?: number
  fleetRows?: FleetBoardRow[]
  feed?: DispatchFeedEntry[]
  fleetSize: number
  simSpeed: number
  onSimSpeed: (speed: number) => void
  followedCabId?: string | null
  onSelectCab: (cabId: string | null) => void
  onFollowZoom: (direction: number) => void
  isDirectorOn: boolean
  onToggleDirector: () => void
  cabRides: Record<string, number>
  riderByCab: Record<string, RiderInfo>
  waits: number[]
  isPreparing: boolean
  isUnavailable: boolean
  report: ShiftReportCategory[] | null
  reportTopline?: Array<{ value: string; label: string }> | null
  onStart: () => void
  onReplay: () => void
}

export function CybercabExperience({
  phase,
  clock,
  simSec,
  ridesServed,
  openRequests,
  fleetRows,
  feed,
  fleetSize,
  simSpeed,
  onSimSpeed,
  followedCabId,
  onSelectCab,
  onFollowZoom,
  isDirectorOn,
  onToggleDirector,
  cabRides,
  riderByCab,
  waits,
  isPreparing,
  isUnavailable,
  report,
  reportTopline,
  onStart,
  onReplay,
}: CybercabExperienceProps) {
  const running = phase !== "idle"
  const driveIn = running && simSec < SERVICE_START
  const windDown = phase === "running" && simSec >= SERVICE_END
  // Median wait redraws when a ride completes, not on every paced frame.
  const sortedWaits = useMemo(() => [...waits].sort((a, b) => a - b), [waits.length])
  const p50 = percentileOf(sortedWaits, 50)
  // The report is the answer — it presents itself instead of hiding below
  // the fold of a scrolled pane.
  const reportRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (phase === "results" && report) {
      reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [phase, report !== null])
  const progress = Math.max(0, Math.min(1, (simSec - SHIFT_START) / SHIFT_SPAN))
  const serviceTick = (SERVICE_START - SHIFT_START) / SHIFT_SPAN

  return (
    <div className="experience-layer">
      <aside
        className={phase === "idle" ? "ops-pane is-idle" : "ops-pane"}
        aria-label="Fleet control room"
      >
        <header className="ops-brand">
          <span className="ops-brand-mark" aria-hidden="true" />
          <div>
            <h1>Cybercab · Berlin</h1>
            <p>Charlottenburg pilot district</p>
          </div>
          {running ? (
            <div className="ops-clock-box">
              <span className="ops-clock">
                {phase === "running" ? <span className="hud-live" aria-hidden="true" /> : null}
                {clock}
              </span>
              <span className="ops-phase-chip">
                {phase === "results"
                  ? "Shift complete"
                  : driveIn
                    ? "Rolling out"
                    : windDown
                      ? "Winding down"
                      : "In service"}
              </span>
            </div>
          ) : null}
        </header>

        {phase === "idle" ? (
          <section className="cover-hero" aria-label="Start the shift">
            <p className="cover-lede">
              Five Cybercabs. One Berlin district. Tonight&apos;s evening rush —
              simulated live, down to every traffic light.
            </p>
            {isUnavailable ? (
              <div className="cover-unavailable" role="status">
                The simulator is waking up — give it a minute, then reload.
              </div>
            ) : (
              <button
                type="button"
                className="gold-button gold-button-glow"
                onClick={onStart}
                disabled={isPreparing}
              >
                {isPreparing ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    Starting the simulator
                  </>
                ) : (
                  "Start the shift"
                )}
              </button>
            )}
            <p className="cover-facts">
              18:00 – 19:00 · Charlottenburg, Moabit &amp; Tiergarten · riders from
              MATSim&apos;s digital Berlin
            </p>
            <p className="cover-note">Runs by itself · every visit is a different evening</p>
          </section>
        ) : (
          <>
            <div className="shift-track" aria-hidden="true">
              <span className="shift-track-tick" style={{ left: `${serviceTick * 100}%` }} />
              <i style={{ width: `${progress * 100}%` }} />
              <span className="shift-track-labels">
                <em>17:45</em>
                <em style={{ left: `${serviceTick * 100}%` }}>18:00</em>
                <em className="is-end">19:00</em>
              </span>
            </div>

            <section className="ops-topline" aria-label="Shift key numbers">
              <div className="topline-stat">
                <strong>{ridesServed ?? 0}</strong>
                <span>riders served</span>
              </div>
              <div className="topline-stat">
                <strong>{sortedWaits.length ? formatMinutes(p50) : "–"}</strong>
                <span>median wait</span>
              </div>
              <div
                className={
                  (openRequests ?? 0) > 0 ? "topline-waiting is-active" : "topline-waiting"
                }
              >
                {(openRequests ?? 0) > 0
                  ? `${openRequests} waiting now`
                  : driveIn
                    ? "service opens 18:00"
                    : "no one waiting"}
              </div>
            </section>

            <section className="fleet-list" aria-label="Fleet">
              <div className="block-title">
                <span>Fleet</span>
                <span className="block-note">click a cab to ride along</span>
              </div>
              {(fleetRows ?? []).map((row) => {
                const followed = row.id === followedCabId
                return (
                  <div key={row.id} className={followed ? "cab-row is-followed" : "cab-row"}>
                    <button
                      type="button"
                      className="cab-row-main"
                      onClick={() => onSelectCab(followed ? null : row.id)}
                    >
                      <MiniCab tone={stateTone(row.state)} />
                      <span className="cab-row-name">{cabLabel(row.id)}</span>
                      <span className="cab-row-story">
                        {cabStory(row, riderByCab[row.id])}
                      </span>
                      <span className="cab-row-metric">{cabMetric(row)}</span>
                    </button>
                    {followed ? (
                      <div className="cab-row-chase">
                        <span className="chase-label">
                          <span className="hud-live" aria-hidden="true" />
                          Riding along
                        </span>
                        <span className="chase-detail">
                          {cabRides[row.id] ?? 0} rides tonight
                          {typeof row.battery === "number" ? ` · ${row.battery}% battery` : ""}
                        </span>
                        <span className="chase-controls">
                          <button type="button" onClick={() => onFollowZoom(-1)} aria-label="Zoom out">
                            −
                          </button>
                          <button type="button" onClick={() => onFollowZoom(1)} aria-label="Zoom in">
                            +
                          </button>
                          <button
                            type="button"
                            className="chase-release"
                            onClick={() => onSelectCab(null)}
                          >
                            Overview
                          </button>
                        </span>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </section>

            {phase === "results" && report ? (
              <section className="ops-report" aria-label="Shift report" ref={reportRef}>
                <div className="block-title">
                  <span>Shift report</span>
                  <span className="block-note">
                    18:00 – 19:00 · {fleetSize} cabs · Charlottenburg
                  </span>
                </div>
                {reportTopline ? (
                  <div className="report-topline" aria-label="Headline results">
                    {reportTopline.map((stat) => (
                      <div key={stat.label} className="report-topline-stat">
                        <strong>{stat.value}</strong>
                        <span>{stat.label}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="report-columns">
                  {report.map((category) => (
                    <div key={category.title} className="report-category">
                      <h3>{category.title}</h3>
                      <dl>
                        {category.rows.map((row) => (
                          <div key={row.label} className="report-line">
                            <dt>{row.label}</dt>
                            <dd>{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
                <div className="report-footer">
                  <span className="report-footnote">
                    ¹ includes stand and depot legs · riders are MATSim&apos;s 1% synthetic Berlin
                    <br />² vs 147 g/km petrol car, at 363 g/kWh German grid electricity
                  </span>
                  <span className="report-rerun">
                    <button type="button" className="ghost-button" onClick={onReplay}>
                      Run a new evening
                    </button>
                  </span>
                </div>
              </section>
            ) : (
              <section className="ops-ticker" aria-label="Dispatch events">
                <div className="block-title">
                  <span>Tonight</span>
                </div>
                {(feed ?? []).slice(0, 8).map((entry) => (
                  <div key={entry.key} className={`ticker-row tone-${feedTone(entry.status)}`}>
                    <span className="ticker-time">{formatClock(entry.atSec)}</span>
                    <span className="ticker-text">{feedText(entry)}</span>
                  </div>
                ))}
                {(feed ?? []).length === 0 ? (
                  <div className="ticker-row tone-open">
                    <span className="ticker-time">{driveIn ? clock : "18:00"}</span>
                    <span className="ticker-text">
                      {driveIn ? "Convoy leaving the Cybercab depot" : "Waiting for the first rider"}
                    </span>
                  </div>
                ) : null}
              </section>
            )}
          </>
        )}
      </aside>

      {phase === "running" ? (
        <div className="map-controls" aria-label="Camera and speed">
          <button
            type="button"
            className={isDirectorOn || followedCabId ? "ops-chip" : "ops-chip is-active"}
            onClick={onToggleDirector}
          >
            {isDirectorOn || followedCabId ? "Overview" : "Follow the action"}
          </button>
          <span className="map-controls-divider" aria-hidden="true" />
          {SIM_SPEED_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              className={choice === simSpeed ? "ops-chip is-active" : "ops-chip"}
              onClick={() => onSimSpeed(choice)}
            >
              {choice}×
            </button>
          ))}
        </div>
      ) : null}

      {phase === "running" ? (
        <aside className="map-legend" aria-label="Map legend">
          <ul>
            <li>
              <span className="legend-swatch legend-rider" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="14" height="14">
                  <circle cx="8" cy="8" r="7.2" fill="#ffffff" stroke="rgba(16,20,24,0.3)" />
                  <circle cx="8" cy="5.9" r="2.1" fill="#1c242b" />
                  <path d="M4.4 11.6 a3.6 3.6 0 0 1 7.2 0 z" fill="#1c242b" />
                </svg>
              </span>
              Rider waiting
            </li>
            <li>
              <span className="legend-swatch legend-destination" aria-hidden="true" />
              Destination
            </li>
            <li>
              <span className="legend-swatch legend-line-pickup" aria-hidden="true" />
              To pickup
            </li>
            <li>
              <span className="legend-swatch legend-line-ride" aria-hidden="true" />
              Ride
            </li>
            <li>
              <span className="legend-swatch legend-cab" aria-hidden="true" />
              Cybercab
            </li>
          </ul>
        </aside>
      ) : null}
    </div>
  )
}

function MiniCab({ tone }: { tone: string }) {
  return <span className={`mini-cab tone-${tone}`} aria-hidden="true" />
}

// One live sentence per cab: what it is doing right now, in rider terms.
function cabStory(row: FleetBoardRow, rider?: RiderInfo) {
  switch (row.state) {
    case "with_passenger":
      return rider?.requestedAtSec
        ? `Rider aboard · hailed ${formatClock(rider.requestedAtSec)}`
        : "Rider aboard"
    case "en_route_pickup":
      return "On the way to a rider"
    case "roaming":
    case "staged":
      return "Heading to a stand"
    case "idle":
      return "Waiting at a stand"
    case "idle_at_depot":
      return "At the depot"
    case "returning_to_depot":
      return "Heading home"
    case "charging":
      return "Charging at the depot"
    case "offline":
      return "Off duty"
    default:
      return row.state ? row.state.replaceAll("_", " ") : "—"
  }
}

// Right-hand column: speed while moving, battery while parked.
function cabMetric(row: FleetBoardRow) {
  const moving =
    row.state === "with_passenger" ||
    row.state === "en_route_pickup" ||
    row.state === "roaming" ||
    row.state === "staged" ||
    row.state === "returning_to_depot"
  if (moving && typeof row.speedKph === "number") {
    return `${Math.round(row.speedKph)} km/h`
  }
  if (typeof row.battery === "number") {
    return `${row.battery}%`
  }
  return ""
}

function percentileOf(sorted: number[], pct: number) {
  if (sorted.length === 0) {
    return 0
  }
  const index = Math.min(sorted.length - 1, Math.round((pct / 100) * (sorted.length - 1)))
  return sorted[index]
}

function formatMinutes(seconds: number) {
  return `${(seconds / 60).toFixed(1)}m`
}

function cabLabel(id: string) {
  return `Cab ${id.replace(/^cybercab_/, "")}`
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
    case "charging":
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
      return entry.mode ? `New rider · ${riderNoun(entry.mode)}` : "New rider"
    case "assigned":
      return cab ? `${cab} assigned` : "Cab assigned"
    case "onboard":
      return cab ? `Picked up · ${cab}` : "Picked up"
    case "completed":
      return typeof entry.waitSec === "number"
        ? `Dropped off · ${formatMinutes(entry.waitSec)} wait`
        : "Dropped off"
    case "expired":
      return "Rider gave up · no cab free"
    case "rejected":
      return "Declined · shift ending"
    default:
      return entry.status.replaceAll("_", " ")
  }
}

function riderNoun(mode: string) {
  switch (mode) {
    case "car":
      return "driver"
    case "ride":
      return "passenger"
    case "pt":
      return "transit rider"
    case "bike":
      return "cyclist"
    case "walk":
      return "walker"
    default:
      return mode
  }
}

function formatClock(simSec: number) {
  const hours = Math.floor(simSec / 3600) % 24
  const minutes = Math.floor((simSec % 3600) / 60)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}
