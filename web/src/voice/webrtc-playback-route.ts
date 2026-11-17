/** Which of the two playback paths carries a slot's audio, and whether either
 *  of them is actually audible.
 *
 *  Every downstream slot has two possible paths, and exactly one may be live:
 *
 *  - the slot's own `<audio>` element (`element.volume`), which is the only
 *    consumer Chrome pulls reliably for a remote track;
 *  - a gain pipe into the shared mix bus, which is the only path that renders a
 *    gain other than 1 on iOS Safari (whose `element.volume` writes are
 *    ignored) and the only way to boost past 100%.
 *
 *  Muting the wrong one is how a member gets heard twice, or not at all. */

export type PlaybackRoute = "muted" | "element" | "pipe";

export interface RouteInput {
  /** Master output volume (0-1, 0 = muted). */
  master: number;
  /** Per-speaker multiplier (0-4, 1 = neutral). Ignored for an unbound slot. */
  speaker: number;
  /** False until the slot's first RTP packet: a pipe built earlier is bound
   *  dead, so the element carries the gain until then. */
  flowed: boolean;
  /** The context exists but cannot render (autoplay policy, an iOS call). */
  contextRunning: boolean;
  /** The bus element's own playback was refused. Its slots must fall back to
   *  element volume instead of being muted for a pipe nobody plays. */
  busBlocked: boolean;
  /** The pipe could not be built at all (no AudioContext, allocation failed). */
  pipeAvailable: boolean;
}

export interface RouteDecision {
  route: PlaybackRoute;
  /** Element volume to apply; 1 whenever the element is muted or silent. */
  elementVolume: number;
}

/** Decides how a slot should be rendered. Pure so the matrix is testable
 *  without an audio stack. */
export function decideRoute(input: RouteInput): RouteDecision {
  const combined = input.master * Math.max(0, Math.min(4, input.speaker));
  if (input.master <= 0 || combined === 0) {
    // `muted` rather than volume 0: iOS Safari ignores element.volume writes, so
    // a muted-by-volume member would keep playing at full level there.
    return { route: "muted", elementVolume: 1 };
  }
  if (combined === 1) return { route: "element", elementVolume: 1 };
  // Any other gain needs the pipe, but only when the pipe can actually render.
  const pipeUsable = input.flowed && input.contextRunning && !input.busBlocked && input.pipeAvailable;
  if (pipeUsable) return { route: "pipe", elementVolume: 1 };
  // Best effort without the pipe. On iOS this is silent for attenuation
  // (element.volume is ignored there), but the member is still routed and the
  // recovery paths (statechange, visibility, gesture) re-apply the pipe.
  return { route: "element", elementVolume: Math.max(0, Math.min(1, combined)) };
}

/** Whether a slot in this state is audible at all, used to decide whether the
 *  room is blocked. A muted element depends entirely on the bus. */
export function routeIsAudible(decision: RouteDecision, busBlocked: boolean): boolean {
  if (decision.route === "muted") return false;
  if (decision.route === "pipe") return !busBlocked;
  return true;
}
