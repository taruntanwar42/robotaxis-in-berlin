// The one window between the viewer and the running simulation: a small
// card, a few words, a single blue button. Behind it the depot roll-out is
// already underway — the sim computes from page load, only the service hour
// waits for the button.

type IntroCardProps = {
  ready: boolean
  failed: boolean
  onStart: () => void
  onRetry: () => void
}

export function IntroCard({ ready, failed, onStart, onRetry }: IntroCardProps) {
  return (
    <aside className="intro-card" aria-label="Simulation intro">
      <h1>Cybercabs are coming to Berlin</h1>
      <p>
        A fleet of autonomous Cybercabs is rolling out of its depot to serve an
        evening of real Berlin trip demand — simulated live, street by street.
      </p>
      {failed ? (
        <button type="button" className="intro-button" onClick={onRetry}>
          Retry
        </button>
      ) : (
        <button type="button" className="intro-button" disabled={!ready} onClick={onStart}>
          {ready ? "Start simulation" : "Preparing the city…"}
        </button>
      )}
      <p className="intro-hint">
        {failed ? "The simulation backend is still waking up" : "Runs by itself · about two minutes"}
      </p>
    </aside>
  )
}
