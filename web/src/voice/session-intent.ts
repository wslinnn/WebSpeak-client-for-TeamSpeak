/** Per-tab voice session intent: the opaque reconnect token the gateway hands
 *  out in the `connected` message. sessionStorage (not localStorage) so a
 *  reload in the same tab resumes seamlessly while a fresh tab starts clean.
 *  No credentials live here — the token alone restores the server-side join
 *  payload, and it is single-consume with a short server-side TTL. */

const INTENT_STORAGE_KEY = "webspeak:voice-session";

export interface VoiceSessionIntentTarget {
  address: string;
  port: string;
}

export interface VoiceSessionIntent {
  reconnectToken: string;
  savedAt: number;
  /** 展示用目标（仅 host:port，无凭据）：刷新恢复后回填首页 store，
   *  member-server-header 的收藏匹配、折叠记忆 serverKey、fixed 模式密码
   *  预填都以真实目标为准。可缺省——旧存量 intent 按无目标处理。 */
  target?: VoiceSessionIntentTarget;
}

function parseIntentTarget(value: unknown): VoiceSessionIntentTarget | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.address !== "string" || !record.address || record.address.length > 255) return null;
  if (typeof record.port !== "string" || !/^\d{1,5}$/.test(record.port)) return null;
  return { address: record.address, port: record.port };
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
    const target = record.target === undefined ? null : parseIntentTarget(record.target);
    if (record.target !== undefined && !target) return null;
    return { reconnectToken: token, savedAt, ...(target ? { target } : {}) };
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
