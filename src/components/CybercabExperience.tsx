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

export const SIM_SPEED_CHOICES = [10, 40, 120] as const

type CybercabExperienceProps = {
  phase: ExperiencePhase
  clock: string
  shiftProgress?: number
  ridesServed?: number
  openRequests?: number
  fleetRows?: FleetBoardRow[]
  feed?: DispatchFeedEntry[]
  fleetSize: number
  simSpeed: number
  onSimSpeed: (speed: number) => void
  followedCabId?: string | null
  onSelectCab: (cabId: string | null) => void
  isPreparing: boolean
  isUnavailable: boolean
  report: ShiftReportCategory[] | null
  onStart: () => void
  onReplay: () => void
}

export function CybercabExperience({
  phase,
  clock,
  shiftProgress,
  ridesServed,
  openRequests,
  fleetRows,
  feed,
  fleetSize,
  simSpeed,
  onSimSpeed,
  followedCabId,
  onSelectCab,
  isPreparing,
  isUnavailable,
  report,
  onStart,
  onReplay,
}: CybercabExperienceProps) {
  return (
    <div className="experience-layer">
      <aside className="ops-rail" aria-label="Dispatch dashboard">
        <header className="ops-brand">
          <span className="ops-brand-mark" aria-hidden="true" />
          <div>
            <h1>Robotaxis in Berlin</h1>
            <p>Tesla Cybercab fleet · one evening shift</p>
          </div>
        </header>

        <section className="ops-shift" aria-label="Shift status">
          <div className="ops-clock-row">
            {phase === "running" ? <span className="hud-live" aria-hidden="true" /> : null}
            <span className="ops-clock">{phase === "idle" ? "18:00" : clock}</span>
            <span className="ops-window">18:00 – 19:00</span>
          </div>
          <span className="hud-progress" aria-hidden="true">
            <i
              style={{
                width: `${Math.round(Math.max(0, Math.min(1, shiftProgress ?? 0)) * 100)}%`,
              }}
            />
          </span>
          <div className="ops-counters">
            <span>
              <strong>{ridesServed ?? 0}</strong> rides served
            </span>
            <span>
              <strong>{openRequests ?? 0}</strong> waiting
            </span>
          </div>
        </section>

        <section className="ops-controls" aria-label="Simulation controls">
          {phase === "idle" ? (
            isUnavailable ? (
              <div className="cover-unavailable" role="status">
                The simulation backend is waking up. Give it a minute, then reload.
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
                    Preparing
                  </>
                ) : (
                  "Start the shift"
                )}
              </button>
            )
          ) : null}
          <div className="ops-speed" role="group" aria-label="Simulation speed">
            <span className="ops-speed-label">Sim speed</span>
            <div className="ops-speed-options">
              {SIM_SPEED_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={choice === simSpeed ? "ops-speed-chip is-active" : "ops-speed-chip"}
                  onClick={() => onSimSpeed(choice)}
                >
                  {choice}×
                </button>
              ))}
            </div>
          </div>
          {phase === "idle" ? (
            <p className="ops-hint">
              Ten Cybercabs serve one hour of real Berlin evening demand — streets from the
              city&apos;s SUMO network, riders from TU Berlin&apos;s MATSim model. Runs by
              itself, about two minutes.
            </p>
          ) : null}
        </section>

        {fleetRows && fleetRows.length > 0 ? (
          <section className="ops-fleet" aria-label="Fleet status">
            <header className="panel-header">Fleet · {fleetRows.length} Cybercabs</header>
            <ul>
              {fleetRows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={
                      row.id === followedCabId ? "fleet-row is-followed" : "fleet-row"
                    }
                    title={
                      row.id === followedCabId
                        ? "Click to stop following"
                        : "Click to follow this cab"
                    }
                    onClick={() => onSelectCab(row.id === followedCabId ? null : row.id)}
                  >
                    <span
                      className={`fleet-state-dot state-${stateTone(row.state)}`}
                      aria-hidden="true"
                    />
                    <span className="fleet-label">{cabLabel(row.id)}</span>
                    <span className="fleet-status">{stateLabel(row.state)}</span>
                    <span className="fleet-speed">
                      {typeof row.speedKph === "number" && row.speedKph > 1
                        ? `${Math.round(row.speedKph)} km/h`
                        : ""}
                    </span>
                    {typeof row.battery === "number" ? (
                      <span className="fleet-battery" title={`Battery ${row.battery}%`}>
                        <i
                          className={row.battery <= 25 ? "is-low" : undefined}
                          style={{ width: `${Math.max(4, Math.min(100, row.battery))}%` }}
                        />
                      </span>
                    ) : (
                      <span className="fleet-battery is-empty" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {phase !== "idle" && feed && feed.length > 0 ? (
          <section className="ops-dispatch" aria-label="Dispatch feed">
            <header className="panel-header">Dispatch</header>
            <ul>
              {feed.slice(0, 30).map((entry) => (
                <li key={entry.key} className={`feed-row tone-${feedTone(entry.status)}`}>
                  <span className="feed-time">{formatClock(entry.atSec)}</span>
                  <span className="feed-text">{feedText(entry)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>

      {phase === "running" && followedCabId ? (
        <button
          type="button"
          className="follow-chip"
          onClick={() => onSelectCab(null)}
          title="Stop following"
        >
          Following {cabLabel(followedCabId)} <span aria-hidden="true">✕</span>
        </button>
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
              Rider waiting for a cab
            </li>
            <li>
              <span className="legend-swatch legend-destination" aria-hidden="true" />
              Ride destination
            </li>
            <li>
              <span className="legend-swatch legend-line-pickup" aria-hidden="true" />
              Cab driving to pickup
            </li>
            <li>
              <span className="legend-swatch legend-line-ride" aria-hidden="true" />
              Ride under way
            </li>
            <li>
              <span className="legend-swatch legend-cab" aria-hidden="true" />
              Cybercab · click to follow
            </li>
          </ul>
        </aside>
      ) : null}

      {phase === "results" && report ? (
        <div className="veil veil-report">
          <section className="report-card report-card-wide" aria-label="Shift report">
            <span className="kicker">Shift report</span>
            <h2>Shift complete</h2>
            <p className="report-subline">
              18:00 – 19:00 · {fleetSize} Cybercabs · Charlottenburg, Moabit &amp; Tiergarten
            </p>
            <div className="report-categories">
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
      return "Pickup"
    case "with_passenger":
      return "Riding"
    case "roaming":
      return "Roaming"
    case "staged":
      return "Moving"
    case "idle":
      return "Parked"
    case "idle_at_depot":
      return "Depot"
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
      return entry.mode
        ? `New request (usually rides ${modeLabel(entry.mode)})`
        : "New ride request"
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
