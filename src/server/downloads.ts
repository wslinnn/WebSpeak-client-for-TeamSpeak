/** Metadata for the third-party Android client's GitHub release, served to the
 *  download page through a same-origin endpoint (the page itself must not call
 *  api.github.com: CSP keeps connect-src same-origin only, and unauthenticated
 *  GitHub rate limits would be shared by every visitor otherwise). */

export interface AndroidReleaseInfo {
  version: string;
  apkName: string;
  apkUrl: string;
  apkSizeBytes: number;
  /** Lowercase hex digest when GitHub provides one, empty otherwise. */
  apkSha256: string;
}

const DEFAULT_REPO = "wslinnn/TS6_Droid_CN";
const SUCCESS_TTL_MS = 10 * 60_000;
const FAILURE_TTL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;

export function createAndroidReleaseLookup(options: {
  repo?: string;
  cacheTtlMs?: number;
  failureTtlMs?: number;
  timeoutMs?: number;
  fetchJson?: (url: string, timeoutMs: number) => Promise<unknown>;
} = {}): () => Promise<AndroidReleaseInfo | null> {
  const repo = options.repo?.trim() || DEFAULT_REPO;
  const successTtlMs = options.cacheTtlMs ?? SUCCESS_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? FAILURE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  let cached: { info: AndroidReleaseInfo | null; expiresAt: number } | null = null;
  return async () => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.info;
    let info: AndroidReleaseInfo | null = null;
    try {
      info = parseRelease(await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`, timeoutMs));
    } catch {
      // Unreachable / rate-limited GitHub degrades to the plain releases link.
      info = null;
    }
    cached = { info, expiresAt: now + (info ? successTtlMs : failureTtlMs) };
    return info;
  };
}

export function parseRelease(payload: unknown): AndroidReleaseInfo | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const version = typeof record.tag_name === "string" ? record.tag_name.trim().slice(0, 40) : "";
  if (!version || !Array.isArray(record.assets)) return null;
  for (const asset of record.assets) {
    if (typeof asset !== "object" || asset === null) continue;
    const entry = asset as Record<string, unknown>;
    const name = typeof entry.name === "string" ? entry.name : "";
    const url = typeof entry.browser_download_url === "string" ? entry.browser_download_url : "";
    if (!name.toLowerCase().endsWith(".apk") || !url.startsWith("https://")) continue;
    const digest = typeof entry.digest === "string" && entry.digest.startsWith("sha256:") ? entry.digest.slice(7).trim() : "";
    return {
      version,
      apkName: name.slice(0, 120),
      apkUrl: url.slice(0, 400),
      apkSizeBytes: typeof entry.size === "number" && Number.isFinite(entry.size) && entry.size >= 0 ? Math.floor(entry.size) : 0,
      apkSha256: /^[0-9a-f]{64}$/i.test(digest) ? digest.toLowerCase() : "",
    };
  }
  return null;
}

async function defaultFetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`GitHub API responded ${response.status}`);
  return await response.json();
}
