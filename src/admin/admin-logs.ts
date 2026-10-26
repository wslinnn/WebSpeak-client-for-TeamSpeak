import { closeSync, fstatSync, openSync, readSync } from "node:fs";

/** Structured log access for the admin operations view: bounded tail reads,
 *  pino-line parsing and connection-history reconstruction. Pure functions of
 *  the log files only — no router or service state lives here. */

export interface AdminConnectionRecord {
  id: string;
  nickname: string;
  clientIp: string;
  target: string;
  startedAt: string;
  connectedAt: string | null;
  disconnectedAt: string | null;
  durationSeconds: number | null;
  status: "active" | "connecting" | "disconnected" | "failed";
  reason: string | null;
  failureDetail: string | null;
}

interface AdminLogEntry {
  timestamp: string | null;
  level: string;
  message: string;
  context: Record<string, string | number | boolean>;
}

/** Per-file scan budget for log tails; keeps the synchronous read bounded. */
const LOG_TAIL_MAX_LINES = 1_200;
const LOG_TAIL_MAX_BYTES = 384 * 1024;
const LOG_TAIL_CHUNK_BYTES = 64 * 1024;

/**
 * Reads the newest `maxLines` lines of a log file without loading the file:
 * chunks are walked backwards from the end until the line budget or a byte
 * cap is reached. Returns lines newest-first. The whole endpoint used to
 * readFileSync entire rotations twice per request, which blocked the event
 * loop (and with it live audio) for tens of megabytes.
 */
function readLogTail(filePath: string, maxLines: number, maxBytes = LOG_TAIL_MAX_BYTES): string[] {
  let descriptor: number;
  try { descriptor = openSync(filePath, "r"); } catch { return []; }
  const lines: string[] = [];
  try {
    const size = fstatSync(descriptor).size;
    let position = size;
    let scanned = 0;
    let carry = "";
    while (position > 0 && lines.length < maxLines && scanned < maxBytes) {
      const length = Math.min(LOG_TAIL_CHUNK_BYTES, position, maxBytes - scanned);
      position -= length;
      const buffer = Buffer.alloc(length);
      readSync(descriptor, buffer, 0, length, position);
      scanned += length;
      const parts = (buffer.toString("utf8") + carry).split("\n");
      carry = parts[0] ?? "";
      for (let index = parts.length - 1; index >= 1 && lines.length < maxLines; index--) {
        const line = parts[index]!.trim();
        if (line) lines.push(line);
      }
    }
    if (position === 0 && lines.length < maxLines) {
      const first = carry.trim();
      if (first) lines.push(first);
    }
  } catch {
    // A rotated file can disappear or shrink between open and read; return
    // whatever was collected.
  } finally {
    closeSync(descriptor);
  }
  return lines;
}

export function readRecentLogs(logFile: string | undefined, limit: number): AdminLogEntry[] {
  if (!logFile) return [];
  // Newest-first: the log viewer answers "what just happened", so the freshest
  // entry must be the first thing the admin sees (readLogTail already walks
  // the file backwards). The connection-history view re-derives its own
  // chronological order from the same file.
  return readLogTail(logFile, limit).map((line) => {
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      const context: Record<string, string | number | boolean> = {};
      for (const key of ["component", "entryId", "code", "reason", "attempt", "target", "nickname", "clientIp", "channel", "reconnect", "port"]) {
        const value = raw[key];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") context[key] = value;
      }
      return {
        timestamp: typeof raw.time === "string" ? raw.time : null,
        level: logLevelName(raw.level),
        message: typeof raw.msg === "string" ? raw.msg : "",
        context,
      };
    } catch {
      return { timestamp: null, level: "INFO", message: line.slice(0, 1000), context: {} };
    }
  });
}

interface StructuredLogEntry {
  timestamp: string | null;
  message: string;
  raw: Record<string, unknown>;
}

export function readConnectionHistory(logFile: string | undefined, limit: number): AdminConnectionRecord[] {
  if (!logFile) return [];
  const records = new Map<string, {
    id: string;
    nickname: string;
    clientIp: string;
    target: string;
    startedAt: string | null;
    connectedAt: string | null;
    disconnectedAt: string | null;
    durationSeconds: number | null;
    status: AdminConnectionRecord["status"];
    reason: string | null;
    failureDetail: string | null;
  }>();
  for (const log of readStructuredLogs(logFile)) {
    const entryId = typeof log.raw.entryId === "string" ? log.raw.entryId : "";
    if (!entryId || !log.timestamp) continue;
    const current = records.get(entryId) ?? {
      id: entryId,
      nickname: "",
      clientIp: "",
      target: "",
      startedAt: null,
      connectedAt: null,
      disconnectedAt: null,
      durationSeconds: null,
      status: "connecting" as const,
      reason: null,
      failureDetail: null,
    };
    const nickname = typeof log.raw.nickname === "string" ? log.raw.nickname : "";
    const clientIp = typeof log.raw.clientIp === "string" ? log.raw.clientIp : "";
    const target = typeof log.raw.target === "string" ? log.raw.target : "";
    if (nickname) current.nickname = nickname;
    if (clientIp) current.clientIp = clientIp;
    if (target) current.target = target;
    if (typeof log.raw.failureDetail === "string" && log.raw.failureDetail) current.failureDetail = log.raw.failureDetail;
    if (log.message === "WebClient connecting") {
      current.startedAt ??= log.timestamp;
      current.status = "connecting";
    } else if (log.message === "TS connect failed") {
      current.reason = typeof log.raw.code === "string" ? log.raw.code : current.reason;
      current.status = "failed";
    } else if (log.message === "Web client connected to TeamSpeak") {
      current.startedAt ??= log.timestamp;
      current.connectedAt = log.timestamp;
      current.status = "active";
    } else if (log.message === "Client session torn down") {
      current.startedAt ??= log.timestamp;
      current.disconnectedAt = log.timestamp;
      current.durationSeconds = current.connectedAt && typeof log.raw.durationSeconds === "number"
        ? Math.max(0, Math.floor(log.raw.durationSeconds))
        : current.connectedAt
          ? Math.max(0, Math.floor((Date.parse(log.timestamp) - Date.parse(current.connectedAt)) / 1000))
          : null;
      current.status = current.connectedAt ? "disconnected" : "failed";
      // `reason` is also used for ordinary lifecycle teardown (for example
      // websocket-close when a user clicks Leave). Only preserve an explicit
      // TeamSpeak failure code here; otherwise a normal disconnect would be
      // rendered by the admin UI as the generic request-failed message.
      current.reason = typeof log.raw.failureCode === "string" && log.raw.failureCode
        ? log.raw.failureCode
        : current.reason;
    }
    records.set(entryId, current);
  }
  const now = Date.now();
  return [...records.values()]
    .filter((record): record is typeof record & { startedAt: string } => Boolean(record.startedAt))
    .map((record) => {
      const start = record.connectedAt ?? record.startedAt;
      const end = record.disconnectedAt ? Date.parse(record.disconnectedAt) : now;
      return {
        id: record.id,
        nickname: record.nickname || "—",
        clientIp: record.clientIp || "—",
        target: record.target || "—",
        startedAt: record.startedAt,
        connectedAt: record.connectedAt,
        disconnectedAt: record.disconnectedAt,
        durationSeconds: record.durationSeconds ?? (record.status === "active" || record.status === "connecting"
          ? Math.max(0, Math.floor((end - Date.parse(start)) / 1000))
          : null),
        status: record.status,
        // Older sessions may only contain a teardown record without a
        // structured failure code. Keep normal disconnects quiet, but make
        // an untraceable failed connection explicitly visible as the generic
        // request-failed message instead of implying a guessed cause.
        reason: record.reason ?? (record.status === "failed" ? "CONNECTION_FAILED" : null),
        failureDetail: record.failureDetail,
      };
    })
    .sort((left, right) => Date.parse(right.disconnectedAt ?? right.startedAt) - Date.parse(left.disconnectedAt ?? left.startedAt))
    .slice(0, limit);
}

function readStructuredLogs(logFile: string): StructuredLogEntry[] {
  // Recent sessions live at the tail of the current log; older rotations are
  // scanned with the same bounded budget so history reaches back a little
  // further without ever loading whole files.
  const paths = [logFile, `${logFile}.1`, `${logFile}.2`, `${logFile}.3`].filter((value, index, all) => value && all.indexOf(value) === index);
  const entries: StructuredLogEntry[] = [];
  for (const path of paths) {
    for (const line of readLogTail(path, LOG_TAIL_MAX_LINES)) {
      try {
        const raw = JSON.parse(line) as Record<string, unknown>;
        entries.push({
          timestamp: typeof raw.time === "string" ? raw.time : null,
          message: typeof raw.msg === "string" ? raw.msg : "",
          raw,
        });
      } catch {
        // Non-JSON lines are still shown by the normal log viewer, but cannot
        // be associated with a user session safely.
      }
    }
  }
  return entries.sort((left, right) => Date.parse(left.timestamp ?? "") - Date.parse(right.timestamp ?? ""));
}

function logLevelName(level: unknown): string {
  if (level === 10) return "DEBUG";
  if (level === 30) return "INFO";
  if (level === 40) return "WARN";
  if (level === 50) return "ERROR";
  if (level === 60) return "FATAL";
  return typeof level === "string" ? level.toUpperCase() : "INFO";
}
