// The one window between the viewer and the running simulation: a small
// card, a few words, a single blue button. The simulation computes from page
// load; the button states name what the backend is actually doing.

type IntroCardProps = {
  ready: boolean
  failed: boolean
  stage: "connecting" | "simulating" | "ready"
  onStart: () => void
  onRetry: () => void
}

const STAGE_LABEL: Record<IntroCardProps["stage"], string> = {
  connecting: "Contacting the simulator",
  simulating: "Starting Berlin — live SUMO run",
  ready: "Start simulation",
}

export function IntroCard({ ready, failed, stage, onStart, onRetry }: IntroCardProps) {
  return (
    <aside className="intro-card" aria-label="Simulation intro">
      <h1>Cybercabs are coming to Berlin</h1>
      <p>
        A fleet of autonomous Cybercabs stands ready across Berlin to serve an
        evening of real trip demand — simulated live, street by street.
      </p>
      {failed ? (
        <button type="button" className="intro-button" onClick={onRetry}>
          Retry
        </button>
      ) : (
        <button type="button" className="intro-button" disabled={!ready} onClick={onStart}>
          {ready ? STAGE_LABEL.ready : STAGE_LABEL[stage]}
        </button>
      )}
      {!ready && !failed ? <span className="intro-loadbar" aria-hidden="true" /> : null}
      <p className="intro-hint">
        {failed
          ? "The simulation backend is still waking up"
          : "Runs by itself · about two minutes"}
      </p>
    </aside>
  )
}
