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
  /** Whether a piped gain can still reach the chosen output. The pipe renders
   *  through `AudioContext.destination`, which always plays on the default
   *  device (no `AudioContext.setSinkId` in Chromium, measured 2026-11-18). */
  sinkRoutable: boolean;
  /** The pipe could not be built at all (no AudioContext, allocation failed). */
  pipeAvailable: boolean;
  /** Whether this platform renders HTMLMediaElement volume writes. iOS Safari
   *  (and iPadOS under a desktop UA) route playback through the system audio
   *  session and ignore them, so only there does attenuation need a pipe. */
  elementVolumeHonored: boolean;
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
  // Attenuation needs the pipe only where element volume is ignored: the pipe
  // plays through a second media element whose clock is independent of the
  // receiver's, so on hardware that does not run the context's rate it drifts
  // and audibly stretches playback (measured on Android Chrome, 2026-11-18).
  if (combined < 1 && input.elementVolumeHonored) {
    return { route: "element", elementVolume: Math.max(0, Math.min(1, combined)) };
  }
  // Any other gain needs the pipe, but only when the pipe can actually render
  // on the device that was chosen.
  const pipeUsable = input.flowed && input.contextRunning && input.sinkRoutable && input.pipeAvailable;
  if (pipeUsable) return { route: "pipe", elementVolume: 1 };
  // Best effort without the pipe: a boost cannot be expressed at all (element
  // volume stops at 1), so it is clamped rather than silently applied at full
  // level. On iOS the attenuation case is also inert here (element volume is
  // ignored), but the member is still routed and the recovery paths
  // (statechange, visibility, gesture) re-apply the pipe.
  return { route: "element", elementVolume: Math.max(0, Math.min(1, combined)) };
}

/** Whether a slot in this state is audible at all, used to decide whether the
 *  room is blocked. A muted element depends entirely on the bus. */
export function routeIsAudible(decision: RouteDecision, busBlocked: boolean): boolean {
  if (decision.route === "muted") return false;
  if (decision.route === "pipe") return !busBlocked;
  return true;
}
