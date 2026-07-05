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

type CybercabExperienceProps = {
  phase: ExperiencePhase
  clock: string
  ridesServed?: number
  isPreparing: boolean
  isUnavailable: boolean
  report: ShiftReportData | null
  onStart: () => void
  onReplay: () => void
}

export function CybercabExperience({
  phase,
  clock,
  ridesServed,
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
          <section className="cover-card" aria-label="Robotaxis in Berlin">
            <span className="kicker">Fleet simulation</span>
            <h1>Robotaxis in Berlin</h1>
            <p>
              Five Tesla Cybercabs serve one evening hour of real Berlin ride demand across
              Charlottenburg, Moabit and Tiergarten.
            </p>
            {isUnavailable ? (
              <div className="cover-unavailable" role="status">
                The simulation backend is waking up. Give it a minute, then reload.
              </div>
            ) : (
              <button
                type="button"
                className="gold-button"
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
            <span className="cover-microline">18:00 – 19:00 · runs by itself · about 2 minutes</span>
          </section>
        </div>
      ) : null}

      {phase === "running" ? (
        <div className="hud" role="status" aria-label="Shift status">
          <span className="hud-clock">{clock}</span>
          <span className="hud-dot" aria-hidden="true" />
          <span className="hud-counter">
            <strong>{ridesServed ?? 0}</strong> rides served
          </span>
        </div>
      ) : null}

      {phase === "results" ? (
        <div className="veil veil-report">
          <section className="report-card" aria-label="Shift report">
            <span className="kicker">Shift report</span>
            <h2>Shift complete</h2>
            <p className="report-subline">18:00 – 19:00 · 5 Cybercabs · Charlottenburg, Moabit &amp; Tiergarten</p>
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
