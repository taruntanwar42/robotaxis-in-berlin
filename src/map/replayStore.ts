// Tiny external store for the replay clock so the map's rAF loop and the
// section UI share state without rerendering the world at 60 fps.

export interface ReplayState {
  timeSec: number;
  playing: boolean;
  speed: number; // sim seconds per wall second
  follow: boolean; // street-level camera riding with a working cab
}

type Listener = () => void;

let state: ReplayState = { timeSec: 64_800, playing: false, speed: 60, follow: false };
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export const replayStore = {
  get: (): ReplayState => state,
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  set(patch: Partial<ReplayState>) {
    state = { ...state, ...patch };
    emit();
  },
  tick(dtSec: number, endSec: number) {
    if (!state.playing) return;
    // browsers pause rAF in hidden tabs; don't let the backlog leap the clock
    const next = state.timeSec + Math.min(dtSec, 0.1) * state.speed;
    if (next >= endSec) {
      state = { ...state, timeSec: endSec, playing: false };
    } else {
      state = { ...state, timeSec: next };
    }
    emit();
  },
};
