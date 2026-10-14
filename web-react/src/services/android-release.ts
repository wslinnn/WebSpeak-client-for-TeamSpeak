// /api/downloads/android 的取数与校验（DownloadView 旧内联逻辑提纯，便于测试）。
// 校验口径平价旧版：release.version 与 release.apkUrl 必须是字符串，缺一整条视为不可用。
export interface AndroidRelease {
  version: string;
  apkName: string;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string;
}

export function parseAndroidReleasePayload(payload: unknown): AndroidRelease | null {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const info = record.release && typeof record.release === "object" ? (record.release as Record<string, unknown>) : null;
  if (!info || typeof info.version !== "string" || typeof info.apkUrl !== "string") return null;
  return {
    version: info.version,
    apkName: typeof info.apkName === "string" ? info.apkName : "",
    apkUrl: info.apkUrl,
    apkSizeBytes: typeof info.apkSizeBytes === "number" ? info.apkSizeBytes : 0,
    apkSha256: typeof info.apkSha256 === "string" ? info.apkSha256 : "",
  };
}

export async function fetchAndroidRelease(): Promise<AndroidRelease | null> {
  try {
    const response = await fetch("/api/downloads/android", { headers: { accept: "application/json" } });
    const raw: unknown = await response.json().catch(() => null);
    if (!response.ok) return null;
    return parseAndroidReleasePayload(raw);
  } catch {
    // 网关不在线等情况：落到 plain releases 链接（旧版同语义）。
    return null;
  }
}

export function formatApkSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
