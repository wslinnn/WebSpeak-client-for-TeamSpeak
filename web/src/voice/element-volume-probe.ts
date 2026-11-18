/** Whether this platform renders HTMLMediaElement volume writes.
 *
 *  iOS Safari (and iPadOS behind a desktop UA) routes media playback through the
 *  system audio session, which ignores `element.volume`; every other engine
 *  honours it. The distinction decides whether plain attenuation needs the gain
 *  pipe, and that has a real cost: the pipe round-trips a slot's stream through
 *  a MediaStreamAudioDestinationNode and a second media element whose clock is
 *  independent of the WebRTC receiver's. On hardware that does not run the
 *  context's own rate the two drift apart, and playback audibly stretches and
 *  stutters for as long as the slot stays piped (measured on Android Chrome,
 *  2026-11-18 — routing attenuation through the pipe there degraded audio for
 *  the whole duration of a volume change).
 *
 *  Probed instead of sniffed: writing 0.5 and reading the property back tells
 *  the two behaviours apart without a platform or user-agent guess. */

/** One probe per page: the answer cannot change while the document lives. */
let honored: boolean | null = null;

/** Resets the memoised answer. Tests only. */
export function resetElementVolumeProbe(): void {
  honored = null;
}

/** Probes `element` the first time it is called and returns the page-wide
 *  answer afterwards. A throttle that refuses the write, or an engine that
 *  silently keeps the default, resolves to `false` — the pipe then takes over,
 *  which is the safe direction for a slider that would otherwise do nothing. */
export function elementVolumeHonored(element: HTMLAudioElement): boolean {
  if (honored !== null) return honored;
  const previous = element.volume;
  try {
    element.volume = 0.5;
    honored = Math.abs(element.volume - 0.5) < 1e-6;
  } catch {
    honored = false;
  } finally {
    try { element.volume = previous; } catch { /* keep the probed value */ }
  }
  return honored;
}
