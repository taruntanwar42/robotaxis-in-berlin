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

export type RunSummary = {
  fleet: number
  servedPct: number
  p50Min: number
}

const SIM_SPEED_CHOICES = [20, 60, 180]

const SHIFT_START = 63_600
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
  cabRides: Record<string, number>
  cabBatteryHistory: Record<string, number[]>
  riderByCab: Record<string, RiderInfo>
  opsTimeline: OpsSample[]
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
  cabRides,
  cabBatteryHistory,
  riderByCab,
  opsTimeline,
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
  const aboard = (fleetRows ?? []).filter((row) => row.state === "with_passenger").length
  // Charts redraw only when a new 30-sim-sec sample or completed ride lands,
  // not on every paced frame (at 180x that is ~180 renders/sec).
  const sortedWaits = useMemo(() => [...waits].sort((a, b) => a - b), [waits.length])
  const demandChart = useMemo(
    () => <DemandChart timeline={opsTimeline} />,
    [opsTimeline.length],
  )
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
            <h1>Robotaxis in Berlin</h1>
            <p>Cybercab fleet · whole city</p>
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
          <section className="ops-setup" aria-label="Shift setup">
            <div className="setup-line">
              <span className="setup-label">Fleet</span>
              <span className="setup-value">60 Cybercabs · one TXL depot</span>
            </div>
            <div className="setup-line">
              <span className="setup-label">Window</span>
              <span className="setup-value">18:00 – 19:00 · evening rush</span>
            </div>
            <div className="setup-line">
              <span className="setup-label">Riders</span>
              <span className="setup-value">real Berliners · MATSim 1%</span>
            </div>
            {isUnavailable ? (
              <div className="cover-unavailable" role="status">
                Backend waking up — give it a minute, then reload.
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
            <p className="ops-hint">Runs by itself · ~90 seconds</p>
          </section>
        ) : (
          <>
            <section className="ops-kpis" aria-label="Shift key numbers">
              <div className="kpi">
                <strong>{ridesServed ?? 0}</strong>
                <span>served</span>
              </div>
              <div className="kpi">
                <strong>{openRequests ?? 0}</strong>
                <span>waiting</span>
              </div>
              <div className="kpi">
                <strong>{aboard}</strong>
                <span>aboard</span>
              </div>
              <div className="kpi">
                <strong>{sortedWaits.length ? formatMinutes(p50) : "–"}</strong>
                <span>median wait</span>
              </div>
            </section>

            <div className="ops-progress" aria-hidden="true">
              <span className="ops-progress-tick" style={{ left: `${serviceTick * 100}%` }} />
              <i style={{ width: `${progress * 100}%` }} />
              <span className="ops-progress-labels">
                <em>17:40</em>
                <em style={{ left: `${serviceTick * 100}%` }}>18:00</em>
                <em className="is-end">19:00</em>
              </span>
            </div>

            <section className="fleet-grid-block" aria-label="Fleet">
              <div className="block-title">
                <span>Fleet</span>
                <span className="block-note">{fleetSize} cabs · click to ride along</span>
              </div>
              <div className={(fleetRows ?? []).length > 40 ? "fleet-grid is-many" : "fleet-grid"}>
                {(fleetRows ?? []).map((row) => (
                  <button
                    key={`${row.id}:${cabRides[row.id] ?? 0}`}
                    type="button"
                    className={
                      row.id === followedCabId
                        ? `fleet-cell tone-${stateTone(row.state)} is-followed`
                        : `fleet-cell tone-${stateTone(row.state)}`
                    }
                    onClick={() => onSelectCab(row.id === followedCabId ? null : row.id)}
                    title={`${cabLabel(row.id)} · ${stateLabel(row.state)}`}
                  >
                    <span className="fleet-cell-num">{cabNumber(row.id)}</span>
                    <span
                      className="fleet-cell-batt"
                      style={{ width: `${Math.max(6, Math.min(100, row.battery ?? 0))}%` }}
                    />
                  </button>
                ))}
              </div>
              <div className="state-legend" aria-hidden="true">
                <i style={{ background: "#c99700" }} /> riding
                <i style={{ background: "#5b7c99" }} /> pickup
                <i style={{ background: "#b9c2c9" }} /> moving
                <i style={{ background: "#e4e8eb" }} /> parked
                <i style={{ background: "#2c3840" }} /> depot
              </div>
              {followedCabId ? (
                <CabCard
                  cabId={followedCabId}
                  row={(fleetRows ?? []).find((row) => row.id === followedCabId)}
                  rides={cabRides[followedCabId] ?? 0}
                  batteryHistory={cabBatteryHistory[followedCabId] ?? []}
                  rider={riderByCab[followedCabId]}
                  onRelease={() => onSelectCab(null)}
                  onZoom={onFollowZoom}
                />
              ) : null}
            </section>

            <section className="ops-charts" aria-label="Live analytics">
              <div className="chart-block">
                <div className="block-title">
                  <span>Demand</span>
                  <span className="chart-legend">
                    <i className="swatch-requested" /> requested{" "}
                    {opsTimeline.length ? opsTimeline[opsTimeline.length - 1].requested : 0}
                    <i className="swatch-served" /> served{" "}
                    {opsTimeline.length ? opsTimeline[opsTimeline.length - 1].served : 0}
                  </span>
                </div>
                {demandChart}
              </div>
            </section>

            {phase === "results" && report ? (
              <section className="ops-report" aria-label="Shift report" ref={reportRef}>
                <div className="block-title">
                  <span>Shift report</span>
                  <span className="block-note">18:00 – 19:00 · {fleetSize} cabs · Berlin</span>
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
                <div className="report-compare">
                  <span className="report-compare-label">Why 60 cabs</span>
                  <span className="report-compare-item">
                    same evening, 40 cabs serve 70% · 60 serve ~90%
                  </span>
                </div>
                <div className="report-footer">
                  <span className="report-footnote">
                    ¹ incl. repositioning and depot legs · 1% population sample, full city
                    <br />² vs 147 g/km petrol car, net of 363 g/kWh German grid electricity
                    <br />³ waits ≈ pickup drives: the nearest free cab averages ~5 km at city
                    scale
                  </span>
                  <span className="report-rerun">
                    <button type="button" className="ghost-button" onClick={onReplay}>
                      Run again
                    </button>
                  </span>
                </div>
              </section>
            ) : (
              <section className="ops-ticker" aria-label="Dispatch events">
                {(feed ?? []).slice(0, 6).map((entry) => (
                  <div key={entry.key} className={`ticker-row tone-${feedTone(entry.status)}`}>
                    <span className="ticker-time">{formatClock(entry.atSec)}</span>
                    <span className="ticker-text">{feedText(entry)}</span>
                  </div>
                ))}
                {(feed ?? []).length === 0 ? (
                  <div className="ticker-row tone-open">
                    <span className="ticker-time">{driveIn ? clock : "18:00"}</span>
                    <span className="ticker-text">
                      {driveIn ? "Cyberfleet rolling out across the city" : "Waiting for first request"}
                    </span>
                  </div>
                ) : null}
              </section>
            )}
          </>
        )}
      </aside>

      {phase === "running" ? (
        <div className="map-controls" aria-label="Simulation speed">
          <span className="map-controls-label">Speed</span>
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
              Cybercab · click
            </li>
          </ul>
        </aside>
      ) : null}
    </div>
  )
}

function CabCard({
  cabId,
  row,
  rides,
  batteryHistory,
  rider,
  onRelease,
  onZoom,
}: {
  cabId: string
  row?: FleetBoardRow
  rides: number
  batteryHistory: number[]
  rider?: RiderInfo
  onRelease: () => void
  onZoom: (direction: number) => void
}) {
  return (
    <div className="cab-card">
      <div className="cab-card-head">
        <MiniCab tone={stateTone(row?.state)} large />
        <div className="cab-card-title">
          <strong>{cabLabel(cabId)}</strong>
          <span>{stateLabel(row?.state)}</span>
        </div>
        <span className="cab-card-cam">
          <span className="hud-live" aria-hidden="true" />
          Chase cam
          <button type="button" onClick={() => onZoom(-1)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => onZoom(1)} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="cab-camera-release" onClick={onRelease}>
            Release
          </button>
        </span>
      </div>
      <div className="cab-card-stats">
        <span>
          ⚡ <strong>{typeof row?.battery === "number" ? `${row.battery}%` : "–"}</strong>
        </span>
        <span>
          <strong>{typeof row?.speedKph === "number" ? Math.round(row.speedKph) : 0}</strong> km/h
        </span>
        <span>
          <strong>{rides}</strong> rides
        </span>
        <span className="cab-card-rider">
          {rider
            ? `${rider.status === "onboard" ? "aboard" : "to rider"} · ${formatClock(rider.requestedAtSec)}${
                rider.mode ? ` · ${riderNoun(rider.mode)}` : ""
              }`
            : "no rider"}
        </span>
      </div>
      {batteryHistory.length > 1 ? <Sparkline values={batteryHistory} /> : null}
    </div>
  )
}

function DemandChart({ timeline }: { timeline: OpsSample[] }) {
  const width = 320
  const height = 74
  if (timeline.length < 2) {
    return <div className="chart-empty">builds as the hour runs</div>
  }
  const maxY = Math.max(4, ...timeline.map((sample) => sample.requested))
  const x = (t: number) => ((t - SHIFT_START) / SHIFT_SPAN) * width
  const y = (value: number) => height - (value / maxY) * (height - 6)
  const line = (pick: (sample: OpsSample) => number) =>
    timeline.map((sample) => `${x(sample.t).toFixed(1)},${y(pick(sample)).toFixed(1)}`).join(" ")
  const servedArea = `${x(timeline[0].t).toFixed(1)},${height} ${line((s) => s.served)} ${x(
    timeline[timeline.length - 1].t,
  ).toFixed(1)},${height}`
  return (
    <div className="demand-chart-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Requested versus served rides over the hour">
        <line
          x1={x(SERVICE_START)}
          y1="0"
          x2={x(SERVICE_START)}
          y2={height}
          stroke="rgba(20,30,40,0.15)"
          strokeDasharray="3 3"
        />
        <polygon points={servedArea} fill="rgba(201,151,0,0.14)" />
        <polyline points={line((s) => s.requested)} fill="none" stroke="rgba(44,56,64,0.55)" strokeWidth="1.6" />
        <polyline points={line((s) => s.served)} fill="none" stroke="#c99700" strokeWidth="2" />
      </svg>
      <span
        className="demand-service-tick"
        style={{ left: `${((SERVICE_START - SHIFT_START) / SHIFT_SPAN) * 100}%` }}
      >
        18:00
      </span>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const width = 240
  const height = 30
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
  return `Cab ${cabNumber(id)}`
}

function cabNumber(id: string) {
  return id.replace(/^cybercab_/, "")
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
    case "charging":
      return "Charging"
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
      return entry.mode ? `New request · ${riderNoun(entry.mode)}` : "New request"
    case "assigned":
      return cab ? `${cab} assigned` : "Cab assigned"
    case "onboard":
      return cab ? `Picked up · ${cab}` : "Picked up"
    case "completed":
      return typeof entry.waitSec === "number"
        ? `Dropped off · ${formatMinutes(entry.waitSec)} wait`
        : "Dropped off"
    case "expired":
      return "Expired · no cab nearby"
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
