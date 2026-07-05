export type ExperiencePhase = "onboarding" | "ready" | "running" | "results"

export type CybercabRunResults = {
  cabsActive?: number
  ridesServed?: number
  requestedRides?: number
  returnedToDepot?: number
  hasAudit: boolean
}

export type CybercabRequestMarkerStatus = "open" | "accepted" | "completed"

export type CybercabRequestMarker = {
  id: string
  status: CybercabRequestMarkerStatus
  lon: number
  lat: number
  assignedCabId?: string
  path?: [number, number][]
}

export type CybercabCabRow = {
  id: string
  label?: string
  state?: string
  speedKph?: number
  etaSec?: number
  target?: string
  stopReason?: string
  requestId?: string
  requestContext?: string
  lon?: number
  lat?: number
  heading?: number
}

export type CybercabLiveNow = {
  currentTime: string
  openRequests?: number
  acceptedRequests?: number
  availableCabs?: number
}

export type CybercabTotals = {
  ridesServed?: number
  totalDemand?: number
  cabsReturned?: number
}

export type CybercabExperienceData = {
  live: CybercabLiveNow
  cabs: CybercabCabRow[]
  totals: CybercabTotals
  requests: CybercabRequestMarker[]
}

type CybercabExperienceProps = {
  phase: ExperiencePhase
  data: CybercabExperienceData
  isSimulationUnavailable?: boolean
  onStartReplay: () => void
}

const initialFleetSize = 5
const emptyMetric = "--"

const tutorialCards = [
  {
    id: "service-area",
    title: "Cybercabs are coming to Berlin",
    body: "Riders in Charlottenburg, Moabit, and Tiergarten can hail a Tesla Cybercab.",
    visual: "area",
  },
  {
    id: "fleet-departure",
    title: "Five cabs leave the depot",
    body: "Five cabs roll out from the existing depot toward the corridor before the 6pm shift.",
    visual: "depot",
  },
  {
    id: "traffic-realism",
    title: "Berlin traffic shapes the run",
    body: "They wait at lights, move with traffic, and serve as many rides as possible before shift end.",
    visual: "traffic",
  },
] as const

export function CybercabExperience({
  phase,
  data,
  isSimulationUnavailable = false,
  onStartReplay,
}: CybercabExperienceProps) {
  const showOnboarding = phase === "onboarding"
  const showSimulationPane = phase === "running" || phase === "ready" || phase === "results"
  const showResults = phase === "results"
  const phaseLabel = phase === "results" ? "Return" : phase === "running" ? "Service" : "Deploy"
  const cabRows = buildCabRows(data.cabs)
  const requestSummary = summarizeRequests(data.requests, data.live)
  const allCabsReturned =
    typeof data.totals.cabsReturned === "number" && data.totals.cabsReturned >= initialFleetSize

  return (
    <section className="experience-layer" aria-label="Berlin Cybercab experience">
      {showSimulationPane ? (
        <div className="simulation-pane" aria-label="Simulation status">
          {isSimulationUnavailable ? (
            <div className="simulation-unavailable" role="status">
              <strong>Simulation unavailable</strong>
            </div>
          ) : (
            <>
              <section className="simulation-section" aria-label="Live now">
                <div className="simulation-section-header">
                  <span className="experience-hud-label">West-central corridor</span>
                  <h2>Live now</h2>
                </div>
                <div className="live-now-grid">
                  <ResultMetric label="Time" value={data.live.currentTime} />
                  <ResultMetric label="Open requests" value={data.live.openRequests} />
                  <ResultMetric label="Accepted/in-progress" value={data.live.acceptedRequests} />
                  <ResultMetric label="Available cabs" value={data.live.availableCabs} />
                </div>
                <RequestStrip summary={requestSummary} />
              </section>

              <section className="simulation-section" aria-label="Cybercab fleet">
                <div className="simulation-section-header">
                  <span className="experience-hud-label">Fleet</span>
                  <h2>Five cabs</h2>
                </div>
                <div className="cab-row-list">
                  {cabRows.map((cab) => (
                    <CabRow key={cab.id} cab={cab} />
                  ))}
                </div>
              </section>

              <section className="simulation-section" aria-label="Accumulated totals">
                <div className="simulation-section-header">
                  <span className="experience-hud-label">{showResults ? "Shift complete" : "Totals"}</span>
                  <h2>
                    {showResults
                      ? allCabsReturned
                        ? "Cybercabs returned to depot"
                        : "Cybercabs heading back"
                      : "Accumulated totals"}
                  </h2>
                </div>
                <div className="totals-grid">
                  <ResultMetric label="Rides served" value={data.totals.ridesServed} />
                  <ResultMetric label="Total demand" value={data.totals.totalDemand} />
                  <ResultMetric label="Cabs returned" value={data.totals.cabsReturned} />
                  <ResultMetric label="Current phase" value={phaseLabel} />
                </div>
                {showResults ? <ResultCallout totals={data.totals} allCabsReturned={allCabsReturned} /> : null}
                {showResults ? (
                  <button type="button" className="simulation-replay-button" onClick={onStartReplay}>
                    Replay simulation
                  </button>
                ) : null}
              </section>
            </>
          )}
        </div>
      ) : null}

      {showOnboarding ? (
        <div className="story-modal" role="dialog" aria-modal="true" aria-labelledby="story-title">
          <div className="story-header">
            <div>
              <span className="story-kicker">Berlin Cybercab preview</span>
              <h1 id="story-title">Tesla Cybercabs are coming to Berlin</h1>
            </div>
          </div>

          <div className="story-card-grid">
            {tutorialCards.map((card, index) => (
              <article className="story-card" key={card.id}>
                <StoryVisual kind={card.visual} />
                <div className="story-card-copy">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <h2>{card.title}</h2>
                  <p>{card.body}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="story-actions">
            <button type="button" className="story-primary-button" onClick={onStartReplay}>
              Start simulation
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function buildCabRows(cabs: CybercabCabRow[]) {
  return Array.from({ length: initialFleetSize }, (_, index) => {
    const cab = cabs[index]
    if (cab) {
      return {
        ...cab,
        label: cab.label ?? `Cybercab ${String(index + 1).padStart(2, "0")}`,
      }
    }

    return {
      id: `pending-cab-${index + 1}`,
      label: `Cybercab ${String(index + 1).padStart(2, "0")}`,
    }
  })
}

function summarizeRequests(requests: CybercabRequestMarker[], live: CybercabLiveNow) {
  const summary = {
    open: 0,
    accepted: 0,
    completed: 0,
  }

  for (const request of requests) {
    summary[request.status] += 1
  }

  return {
    open: summary.open || live.openRequests || 0,
    accepted: summary.accepted || live.acceptedRequests || 0,
    completed: summary.completed,
  }
}

function RequestStrip({
  summary,
}: {
  summary: ReturnType<typeof summarizeRequests>
}) {
  return (
    <div className="request-strip" aria-label="Request markers">
      <RequestPill status="open" label="Open" value={summary.open} />
      <RequestPill status="accepted" label="Accepted" value={summary.accepted} />
      <RequestPill status="completed" label="Completed" value={summary.completed} />
    </div>
  )
}

function RequestPill({
  status,
  label,
  value,
}: {
  status: CybercabRequestMarkerStatus
  label: string
  value: number
}) {
  return (
    <div className={`request-pill is-${status}`}>
      <span aria-hidden="true" />
      <strong>{value}</strong>
      <em>{label}</em>
    </div>
  )
}

function CabRow({ cab }: { cab: CybercabCabRow }) {
  return (
    <article className="cab-row">
      <div className="cab-row-main">
        <strong>{cab.label ?? cab.id}</strong>
        <span>{formatCabState(cab.state)}</span>
      </div>
      <CabDetail label="Speed" value={formatSpeed(cab.speedKph)} />
      <CabDetail label="ETA" value={formatEta(cab.etaSec)} />
      <CabDetail label="Task" value={formatCabTask(cab)} />
      <CabDetail label="Stop reason" value={formatStopReason(cab.stopReason)} />
    </article>
  )
}

function ResultCallout({
  totals,
  allCabsReturned,
}: {
  totals: CybercabTotals
  allCabsReturned: boolean
}) {
  const ridesServed = displayValue(totals.ridesServed)
  const totalDemand = displayValue(totals.totalDemand)
  const cabsReturned = displayValue(totals.cabsReturned)

  return (
    <div className="result-callout" aria-label="Simulation result">
      <strong>
        {ridesServed} of {totalDemand} rides served
      </strong>
      <span>
        {allCabsReturned
          ? `${cabsReturned} cabs returned to the depot`
          : `${cabsReturned} cabs at the depot; the fleet is heading back`}
      </span>
    </div>
  )
}

function CabDetail({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="cab-detail">
      <span>{label}</span>
      <strong>{displayValue(value)}</strong>
    </div>
  )
}

function ResultMetric({ label, value }: { label: string; value?: number | string }) {
  return (
    <div className="result-metric">
      <span>{label}</span>
      <strong>{displayValue(value)}</strong>
    </div>
  )
}

function displayValue(value: number | string | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }

  return emptyMetric
}

function formatCabState(state: string | undefined) {
  const normalized = state?.trim().toLowerCase().replaceAll("-", "_")
  if (!normalized) {
    return emptyMetric
  }

  const labels: Record<string, string> = {
    staged: "Waiting",
    idle: "Available",
    charging: "Charging",
    idle_at_depot: "At depot",
    en_route_pickup: "Picking up",
    with_passenger: "With rider",
    returning_to_depot: "Returning",
    failed: "Attention",
    offline: "Offline",
  }

  return labels[normalized] ?? normalized.replaceAll("_", " ")
}

function formatCabTask(cab: CybercabCabRow) {
  const normalized = cab.state?.trim().toLowerCase().replaceAll("-", "_")
  if (cab.requestId || cab.requestContext) {
    if (normalized === "with_passenger") {
      return "Ride in progress"
    }

    return "Heading to pickup"
  }

  if (normalized === "returning_to_depot") {
    return "Depot return"
  }

  if (normalized === "charging") {
    return "Charging"
  }

  return undefined
}

function formatStopReason(reason: string | undefined) {
  const normalized = reason?.trim().toLowerCase().replaceAll("-", "_")
  if (!normalized) {
    return undefined
  }

  const labels: Record<string, string> = {
    red_light: "Red light",
    traffic_light: "Traffic light",
    stopped: "Traffic",
    charging: "Charging",
    waiting_for_pickup: "Waiting for rider",
    dropping_off: "Dropping off",
    low_battery: "Low battery",
  }

  return labels[normalized] ?? "Stopped"
}

function formatSpeed(speedKph: number | undefined) {
  if (typeof speedKph !== "number" || !Number.isFinite(speedKph)) {
    return undefined
  }

  return `${Math.round(speedKph)} km/h`
}

function formatEta(etaSec: number | undefined) {
  if (typeof etaSec !== "number" || !Number.isFinite(etaSec)) {
    return undefined
  }

  const minutes = Math.max(0, Math.round(etaSec / 60))
  return `${minutes} min`
}

function StoryVisual({ kind }: { kind: (typeof tutorialCards)[number]["visual"] }) {
  if (kind === "area") {
    return (
      <div className="story-visual story-visual-area" aria-hidden="true">
        <span className="mini-corridor-label">West-central service corridor</span>
        <span className="mini-zone mini-zone-charlottenburg">Charlottenburg</span>
        <span className="mini-zone mini-zone-moabit">Moabit</span>
        <span className="mini-zone mini-zone-tiergarten">Tiergarten</span>
        <i />
      </div>
    )
  }

  if (kind === "depot") {
    return (
      <div className="story-visual story-visual-depot" aria-hidden="true">
        <span className="mini-depot">Depot</span>
        <span className="mini-service-target">Service corridor</span>
        <span className="mini-cab cab-one" />
        <span className="mini-cab cab-two" />
        <span className="mini-cab cab-three" />
        <span className="mini-cab cab-four" />
        <span className="mini-cab cab-five" />
        <i />
      </div>
    )
  }

  return (
    <div className="story-visual story-visual-traffic" aria-hidden="true">
      <span className="mini-light" />
      <span className="mini-crosswalk" />
      <span className="mini-cab stopped-cab" />
      <span className="mini-traffic-car" />
      <i />
    </div>
  )
}
