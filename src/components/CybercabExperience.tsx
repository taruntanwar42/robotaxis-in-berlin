import { useEffect, useState } from "react"

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

const SIM_SPEED_CHOICES = [10, 40, 120]

type RailTab = "fleet" | "dispatch" | "report"

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
  cabRides: Record<string, number>
  cabBatteryHistory: Record<string, number[]>
  riderByCab: Record<string, RiderInfo>
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
  cabRides,
  cabBatteryHistory,
  riderByCab,
  isPreparing,
  isUnavailable,
  report,
  onStart,
  onReplay,
}: CybercabExperienceProps) {
  const [tab, setTab] = useState<RailTab>("fleet")

  // The report is the shift's ending: bring it up once, in place.
  useEffect(() => {
    if (phase === "results") {
      setTab("report")
    }
    if (phase === "idle") {
      setTab("fleet")
    }
  }, [phase])

  const followedRow = followedCabId
    ? fleetRows?.find((row) => row.id === followedCabId)
    : undefined

  return (
    <div className="experience-layer">
      <aside className="ops-rail" aria-label="Dispatch dashboard">
        <header className="ops-brand">
          <span className="ops-brand-mark" aria-hidden="true" />
          <div>
            <h1>Robotaxis in Berlin</h1>
            <p>Cybercab fleet · Berlin</p>
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
              <strong>{ridesServed ?? 0}</strong> served
            </span>
            <span>
              <strong>{openRequests ?? 0}</strong> waiting
            </span>
          </div>
        </section>

        <section className="ops-speed-row" aria-label="Speed">
          <span className="ops-speed-label">Speed</span>
          <span className="ops-speed-inline">
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
          </span>
        </section>

        {phase === "idle" ? (
          <section className="ops-controls" aria-label="Simulation controls">
            {isUnavailable ? (
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
            )}
            <p className="ops-hint">Real Berlin demand · runs by itself · ~2 min</p>
          </section>
        ) : null}

        <nav className="ops-tabs" aria-label="Dashboard sections">
          <button
            type="button"
            className={tab === "fleet" ? "ops-tab is-active" : "ops-tab"}
            onClick={() => setTab("fleet")}
          >
            Fleet
          </button>
          <button
            type="button"
            className={tab === "dispatch" ? "ops-tab is-active" : "ops-tab"}
            onClick={() => setTab("dispatch")}
          >
            Dispatch
          </button>
          <button
            type="button"
            className={tab === "report" ? "ops-tab is-active" : "ops-tab"}
            disabled={phase !== "results"}
            onClick={() => setTab("report")}
          >
            Report
          </button>
        </nav>

        <div className="ops-tab-body">
          {tab === "fleet" ? (
            followedCabId && phase !== "idle" ? (
              <CabDetail
                cabId={followedCabId}
                row={followedRow}
                rides={cabRides[followedCabId] ?? 0}
                batteryHistory={cabBatteryHistory[followedCabId] ?? []}
                rider={riderByCab[followedCabId]}
                onBack={() => onSelectCab(null)}
              />
            ) : (
              <ul className="cab-list">
                {(fleetRows ?? []).map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="cab-list-row"
                      onClick={() => onSelectCab(row.id)}
                      title="Open cab view and lock the camera to it"
                    >
                      <MiniCab tone={stateTone(row.state)} />
                      <span className="cab-list-label">{cabLabel(row.id)}</span>
                      <span className="cab-list-state">{stateLabel(row.state)}</span>
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
            )
          ) : null}

          {tab === "dispatch" ? (
            <ul className="ops-feed-list">
              {(feed ?? []).slice(0, 40).map((entry) => (
                <li key={entry.key} className={`feed-row tone-${feedTone(entry.status)}`}>
                  <span className="feed-time">{formatClock(entry.atSec)}</span>
                  <span className="feed-text">{feedText(entry)}</span>
                </li>
              ))}
              {(feed ?? []).length === 0 ? (
                <li className="ops-empty">Dispatch events appear here once the shift runs.</li>
              ) : null}
            </ul>
          ) : null}

          {tab === "report" && report ? (
            <div className="ops-report">
              <p className="report-subline">
                18:00 – 19:00 · {fleetSize} Cybercabs · Berlin West
              </p>
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
              <button type="button" className="ghost-button" onClick={onReplay}>
                Watch again
              </button>
            </div>
          ) : null}
        </div>
      </aside>

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
              Cybercab · click
            </li>
          </ul>
        </aside>
      ) : null}
    </div>
  )
}

function CabDetail({
  cabId,
  row,
  rides,
  batteryHistory,
  rider,
  onBack,
}: {
  cabId: string
  row?: FleetBoardRow
  rides: number
  batteryHistory: number[]
  rider?: RiderInfo
  onBack: () => void
}) {
  return (
    <div className="cab-detail">
      <div className="cab-detail-head">
        <button type="button" className="cab-back" onClick={onBack} aria-label="Back to fleet">
          ←
        </button>
        <MiniCab tone={stateTone(row?.state)} large />
        <div>
          <strong>{cabLabel(cabId)}</strong>
          <span className="cab-detail-state">{stateLabel(row?.state)}</span>
        </div>
      </div>

      <button type="button" className="cab-camera-note" onClick={onBack}>
        <span className="hud-live" aria-hidden="true" />
        Chase cam
        <span className="cab-camera-release">Release</span>
      </button>

      <div className="cab-stats">
        <div className="cab-stat">
          <span className="cab-stat-icon" aria-hidden="true">
            ⚡
          </span>
          <strong>{typeof row?.battery === "number" ? `${row.battery}%` : "–"}</strong>
          <span>battery</span>
        </div>
        <div className="cab-stat">
          <span className="cab-stat-icon" aria-hidden="true">
            🡒
          </span>
          <strong>
            {typeof row?.speedKph === "number" ? `${Math.round(row.speedKph)}` : "0"}
          </strong>
          <span>km/h</span>
        </div>
        <div className="cab-stat">
          <span className="cab-stat-icon" aria-hidden="true">
            ✓
          </span>
          <strong>{rides}</strong>
          <span>rides</span>
        </div>
      </div>

      {batteryHistory.length > 1 ? (
        <div className="cab-spark">
          <span className="cab-spark-label">Battery over the shift</span>
          <Sparkline values={batteryHistory} />
        </div>
      ) : null}

      <div className="cab-rider">
        {rider ? (
          <>
            <span className="cab-rider-title">
              {rider.status === "onboard" ? "Rider aboard" : "To rider"}
            </span>
            <span>
              {formatClock(rider.requestedAtSec)}
              {rider.mode ? ` · ${riderNoun(rider.mode)}` : ""}
            </span>
          </>
        ) : (
          <span className="cab-rider-title">No rider</span>
        )}
      </div>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const width = 240
  const height = 44
  const min = Math.min(60, ...values)
  const max = 100
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width
      const y = height - ((value - min) / Math.max(1, max - min)) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg
      className="cab-spark-svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Battery level over the shift"
    >
      <polyline points={points} fill="none" stroke="#4f8a54" strokeWidth="2" />
    </svg>
  )
}

function MiniCab({ tone, large }: { tone: string; large?: boolean }) {
  return (
    <span
      className={large ? `mini-cab mini-cab-large tone-${tone}` : `mini-cab tone-${tone}`}
      aria-hidden="true"
    />
  )
}

function cabLabel(id: string) {
  const suffix = id.replace(/^cybercab_/, "")
  return `Cab ${suffix}`
}

function stateLabel(state: string | null | undefined) {
  switch (state) {
    case "en_route_pickup":
      return "Driving to pickup"
    case "with_passenger":
      return "Rider aboard"
    case "roaming":
      return "Roaming"
    case "staged":
      return "Repositioning"
    case "idle":
      return "Parked"
    case "idle_at_depot":
      return "At depot"
    case "returning_to_depot":
      return "Returning to depot"
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
      return entry.mode ? `New request · ${riderNoun(entry.mode)}` : "New request"
    case "assigned":
      return cab ? `${cab} assigned` : "Cab assigned"
    case "onboard":
      return cab ? `Picked up · ${cab}` : "Picked up"
    case "completed":
      return typeof entry.waitSec === "number"
        ? `Dropped off · ${Math.round(entry.waitSec)}s wait`
        : "Dropped off"
    case "expired":
      return "Expired unserved"
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
