/** `webspeak:playback-debug` diagnostic flag.
 *
 *  The flag gates console dumps on paths that can run per audio frame, per
 *  voice-route announcement or per volume-slider tick, so it is read once and
 *  cached: a synchronous localStorage read on those paths is main-thread cost
 *  for a log line that is off in production anyway. */
let cached: boolean | null = null;

export function playbackDebugEnabled(): boolean {
  if (cached === null) {
    try {
      cached = localStorage.getItem("webspeak:playback-debug") === "1";
    } catch {
      cached = false;
    }
  }
  return cached;
}

/** Test hook: forget the cached flag (the next call re-reads storage). */
export function resetPlaybackDebugCache(): void {
  cached = null;
}
