/** Per-tab voice session intent: the opaque reconnect token the gateway hands
 *  out in the `connected` message. sessionStorage (not localStorage) so a
 *  reload in the same tab resumes seamlessly while a fresh tab starts clean.
 *  No credentials live here — the token alone restores the server-side join
 *  payload, and it is single-consume with a short server-side TTL. */

const INTENT_STORAGE_KEY = "webspeak:voice-session";

export interface VoiceSessionIntent {
  reconnectToken: string;
  savedAt: number;
}

/** Pure shape check so callers never trust an arbitrary stored value. */
export function parseVoiceSessionIntent(value: unknown): VoiceSessionIntent | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const token = record.reconnectToken;
    const savedAt = record.savedAt;
    if (typeof token !== "string" || token.length < 8 || token.length > 128) return null;
    if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
    return { reconnectToken: token, savedAt };
  } catch {
    return null;
  }
}

export function readVoiceSessionIntent(): VoiceSessionIntent | null {
  try {
    return parseVoiceSessionIntent(sessionStorage.getItem(INTENT_STORAGE_KEY));
  } catch {
    // Storage can be unavailable (privacy mode, sandboxed iframe): no resume.
    return null;
  }
}

export function writeVoiceSessionIntent(intent: VoiceSessionIntent): void {
  try {
    sessionStorage.setItem(INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // Persistence is an optimization; the session works without it.
  }
}

export function clearVoiceSessionIntent(): void {
  try {
    sessionStorage.removeItem(INTENT_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
