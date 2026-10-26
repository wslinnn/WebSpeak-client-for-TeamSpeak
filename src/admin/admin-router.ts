import { Router, type NextFunction, type Request, type Response } from "express";
import type { BlockList } from "node:net";
import { existsSync } from "node:fs";
import { readConnectionHistory, readRecentLogs } from "./admin-logs.js";

export type { AdminConnectionRecord } from "./admin-logs.js";
import type { Logger } from "../logger.js";
import { rateLimitPeerKey, resolveClientAddress } from "../server/client-ip.js";
import { AdminInputError, AdminService, type AdminSettingsInput } from "./admin-service.js";
import { AdminSessionStore, isSecureRequest } from "./admin-session.js";
import { AdminLoginRateLimiter, waitFor } from "./login-rate-limit.js";
import { TeamSpeakProbeError } from "../server/teamspeak-probe.js";
import type { AdminSessionSummary } from "../server/voice-bridge.js";

export interface AdminRouterOptions {
  service: AdminService;
  sessions: AdminSessionStore;
  logger: Logger;
  /** Declares the reverse proxy so login rate limiting keys on the real client. */
  trustProxy?: boolean;
  /** Declared proxies; forwarding headers from anyone else are ignored. */
  trustedProxies: BlockList;
  getActiveSessions(): number;
  getPeakSessions(): number;
  getCreatedSessions?: () => number;
  getSessionSummaries?: () => AdminSessionSummary[];
  getVoiceTransportStats?: () => { connected: number; webrtc: number; compat: number; compatRatio: number };
  terminateSession?: (id: string) => Promise<boolean>;
  version?: string;
  logFile?: string;
  startedAt: number;
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router();
  const limiter = new AdminLoginRateLimiter();
  const logger = options.logger.child({ component: "admin-api" });

  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get("/status", (_request, response) => {
    response.json({ initialized: options.service.isInitialized() });
  });

  router.get("/session", (request, response) => {
    const session = options.sessions.get(request);
    response.json({
      initialized: options.service.isInitialized(),
      authenticated: Boolean(session),
      mustChangePassword: Boolean(session) && options.service.isPasswordChangeRequired(),
      ...(session ? { csrfToken: session.csrfToken, expiresAt: session.expiresAt } : {}),
    });
  });

  router.post("/login", requireSameOrigin, async (request, response) => {
    if (!options.service.isInitialized()) {
      response.status(409).json({ ok: false, code: "NOT_INITIALIZED" });
      return;
    }
    // Keying on the raw socket address collapses every admin behind a reverse
    // proxy into one bucket — one person's typos would lock out all logins.
    // Resolve the real client (only trusting forwarded headers when the
    // operator declared a proxy) and aggregate IPv6 the same way as the other
    // limiters. The resolved address is also what the audit trail records.
    const clientAddress = () => resolveClientAddress(
      request.socket.remoteAddress,
      request.headers["x-forwarded-for"],
      options.trustedProxies,
      request.headers["x-real-ip"],
    );
    const peer = rateLimitPeerKey(clientAddress());
    const retryAfterMs = limiter.retryAfterMs(peer);
    if (retryAfterMs > 0) {
      response.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      response.status(429).json({ ok: false, code: "RATE_LIMITED", retryAfterMs });
      return;
    }
    const body = asRecord(request.body);
    const username = readString(body, "username", 64).trim();
    const password = readOptionalString(body, "password", 1024);
    if (!await options.service.verifyPassword(username, password)) {
      const delayMs = limiter.recordFailure(peer);
      await waitFor(delayMs);
      options.service.database.addAudit("ADMIN_LOGIN_FAILED", { clientIp: clientAddress() });
      logger.warn("Administrator login failed");
      response.status(401).json({ ok: false, code: "INVALID_PASSWORD" });
      return;
    }
    limiter.recordSuccess(peer);
    options.service.database.addAudit("ADMIN_LOGIN_SUCCEEDED", { clientIp: clientAddress() });
    const session = options.sessions.create(response, isSecureRequest(request));
    response.json({ ok: true, csrfToken: session.csrfToken, expiresAt: session.expiresAt, mustChangePassword: options.service.isPasswordChangeRequired() });
  });

  router.post("/change-password", requireSameOrigin, requireCsrf(options.sessions), async (request, response) => {
    try {
      const body = asRecord(request.body);
      await options.service.changePassword(readString(body, "newPassword", 1024));
      response.json({ ok: true, mustChangePassword: false });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.post("/logout", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    options.sessions.destroy(request, response, isSecureRequest(request));
    options.service.database.addAudit("ADMIN_LOGOUT");
    response.json({ ok: true });
  });

  router.use(requireAdmin(options.sessions, options.service));

  router.get("/overview", (_request, response) => {
    response.json(options.service.getOverview(
      options.getActiveSessions(),
      options.getPeakSessions(),
      options.startedAt,
    ));
  });

  router.get("/server", (_request, response) => {
    response.json(options.service.getAdminSettings());
  });

  router.get("/sessions", (_request, response) => {
    response.json({ sessions: options.getSessionSummaries?.() ?? [] });
  });

  router.post("/sessions/:id/terminate", requireSameOrigin, requireCsrf(options.sessions), async (request, response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    if (!options.terminateSession || !id || !(await options.terminateSession(id))) {
      response.status(404).json({ ok: false, code: "SESSION_NOT_FOUND" });
      return;
    }
    options.service.database.addAudit("ADMIN_SESSION_TERMINATED", { id });
    response.json({ ok: true });
  });

  router.get("/audit", (request, response) => {
    response.json({ events: options.service.database.recentAudit(readLimit(request.query.limit, 50)) });
  });

  router.get("/logs", (request, response) => {
    const limit = readLimit(request.query.limit, 100);
    response.json({
      available: Boolean(options.logFile && existsSync(options.logFile)),
      entries: readRecentLogs(options.logFile, limit),
      sessions: readConnectionHistory(options.logFile, limit),
    });
  });

  router.get("/diagnostics", (_request, response) => {
    const overview = options.service.getOverview(
      options.getActiveSessions(),
      options.getPeakSessions(),
      options.startedAt,
    );
    const memory = process.memoryUsage();
    response.json({
      generatedAt: new Date().toISOString(),
      gateway: {
        version: options.version ?? "0.1.0",
        uptimeSeconds: overview.gateway.uptimeSeconds,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        // Baseline-table row "gateway RSS": compare against the ≤150 MB
        // target for a 10-session idle gateway.
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
      sessions: {
        active: options.getActiveSessions(),
        peak: options.getPeakSessions(),
        created: options.getCreatedSessions?.() ?? 0,
        limit: 100,
      },
      // Completed sessions by transport. compatRatio is the Opus-over-WS
      // trigger: a sustained share above ~5% means the PCM fallback carries
      // real traffic and is worth upgrading.
      voiceTransports: options.getVoiceTransportStats?.(),
      teamSpeak: overview.teamSpeak,
      database: { schemaVersion: options.service.database.schemaVersion },
      logs: { available: Boolean(options.logFile && existsSync(options.logFile)) },
    });
  });

  router.get("/diagnostics/report", (_request, response) => {
    const overview = options.service.getOverview(
      options.getActiveSessions(),
      options.getPeakSessions(),
      options.startedAt,
    );
    const memory = process.memoryUsage();
    const report = {
      generatedAt: new Date().toISOString(),
      gateway: {
        version: options.version ?? "0.1.0",
        uptimeSeconds: overview.gateway.uptimeSeconds,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
      sessions: {
        active: options.getActiveSessions(),
        peak: options.getPeakSessions(),
        created: options.getCreatedSessions?.() ?? 0,
        limit: 100,
      },
      voiceTransports: options.getVoiceTransportStats?.(),
      teamSpeak: {
        status: overview.teamSpeak.status,
        lastTestAt: overview.teamSpeak.lastTestAt,
        latencyMs: overview.teamSpeak.latencyMs,
        lastError: overview.teamSpeak.lastError,
      },
      database: { schemaVersion: options.service.database.schemaVersion },
      audit: options.service.database.recentAudit(50),
    };
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="webspeak-diagnostic-report.json"`);
    response.send(JSON.stringify(report, null, 2));
  });

  router.get("/backup", (_request, response) => {
    try {
      const backup = options.service.database.exportBackup();
      options.service.database.addAudit("ADMIN_BACKUP_EXPORTED");
      response.setHeader("Content-Type", "application/octet-stream");
      response.setHeader("Content-Disposition", `attachment; filename="webspeak-backup-${new Date().toISOString().slice(0, 10)}.db"`);
      response.send(backup);
    } catch {
      response.status(500).json({ ok: false, code: "BACKUP_FAILED" });
    }
  });

  router.put("/server", requireSameOrigin, requireCsrf(options.sessions), (request, response) => {
    try {
      options.service.updateSettings(readSettingsInput(asRecord(request.body)));
      response.json({ ok: true, settings: options.service.getAdminSettings() });
    } catch (error: unknown) {
      sendAdminError(response, error);
    }
  });

  router.post("/server/test", requireSameOrigin, requireCsrf(options.sessions), async (request, response) => {
    const body = asRecord(request.body);
    const action = readPasswordAction(body.passwordAction);
    const password = action === "remove"
      ? ""
      : typeof body.serverPassword === "string"
        ? body.serverPassword.slice(0, 512)
        : options.service.getConnectionPolicy().serverPassword;
    await runProbe(options.service, response, readString(body, "target", 300), password, true);
  });

  router.post("/legacy-import/dismiss", requireSameOrigin, requireCsrf(options.sessions), (_request, response) => {
    options.service.dismissLegacyImportNotice();
    response.json({ ok: true });
  });

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    sendAdminError(response, error);
  });

  return router;
}

function requireAdmin(sessions: AdminSessionStore, service: AdminService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!sessions.get(request)) {
      response.status(401).json({ ok: false, code: "AUTH_REQUIRED" });
      return;
    }
    if (service.isPasswordChangeRequired()) {
      response.status(403).json({ ok: false, code: "PASSWORD_CHANGE_REQUIRED" });
      return;
    }
    next();
  };
}

function requireCsrf(sessions: AdminSessionStore) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const session = sessions.get(request);
    const csrf = request.header("x-csrf-token");
    if (!session || !csrf || csrf !== session.csrfToken) {
      response.status(403).json({ ok: false, code: "CSRF_REJECTED" });
      return;
    }
    next();
  };
}

function requireSameOrigin(request: Request, response: Response, next: NextFunction): void {
  if (!request.is("application/json")) {
    response.status(415).json({ ok: false, code: "JSON_REQUIRED" });
    return;
  }
  const origin = request.header("origin");
  const host = request.header("host");
  try {
    if (!origin || !host || new URL(origin).host !== host) throw new Error("origin mismatch");
  } catch {
    response.status(403).json({ ok: false, code: "ORIGIN_REJECTED" });
    return;
  }
  next();
}


async function runProbe(
  service: AdminService,
  response: Response,
  target: string,
  password: string,
  persistResult: boolean,
): Promise<void> {
  try {
    response.json(await service.testConnection(target, password, persistResult));
  } catch (error: unknown) {
    if (error instanceof TeamSpeakProbeError) {
      response.status(400).json({ ok: false, code: error.code });
      return;
    }
    sendAdminError(response, error);
  }
}

function readSettingsInput(body: Record<string, unknown>): AdminSettingsInput {
  return {
    target: readString(body, "target", 300),
    serverPassword: typeof body.serverPassword === "string" ? body.serverPassword.slice(0, 512) : undefined,
    passwordAction: readPasswordAction(body.passwordAction),
    accessMode: body.accessMode === "open" ? "open" : body.accessMode === "fixed" ? "fixed" : body.accessMode as never,
    siteName: readString(body, "siteName", 80),
    welcomeText: readOptionalString(body, "welcomeText", 500),
    welcomeTextEn: typeof body.welcomeTextEn === "string" ? body.welcomeTextEn.slice(0, 500) : undefined,
    welcomeTextDe: typeof body.welcomeTextDe === "string" ? body.welcomeTextDe.slice(0, 500) : undefined,
    welcomeTextRu: typeof body.welcomeTextRu === "string" ? body.welcomeTextRu.slice(0, 500) : undefined,
    welcomeTextJa: typeof body.welcomeTextJa === "string" ? body.welcomeTextJa.slice(0, 500) : undefined,
    webRtcEnabled: body.webRtcEnabled === true,
    webRtcPublicHost: body.webRtcPublicHost as string | undefined,
    webRtcIpv6Enabled: body.webRtcIpv6Enabled as boolean | undefined,
    webRtcStunServer: body.webRtcStunServer as string | undefined,
    webRtcUdpStart: readOptionalInteger(body, "webRtcUdpStart"),
    webRtcUdpEnd: readOptionalInteger(body, "webRtcUdpEnd"),
  };
}

function readPasswordAction(value: unknown): "keep" | "replace" | "remove" {
  return value === "replace" || value === "remove" ? value : "keep";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdminInputError("INVALID_REQUEST", "Request body is invalid");
  return value as Record<string, unknown>;
}

function readString(body: Record<string, unknown>, key: string, max: number): string {
  if (typeof body[key] !== "string" || body[key].length > max) throw new AdminInputError("INVALID_REQUEST", `${key} is invalid`);
  return body[key];
}

function readOptionalInteger(body: Record<string, unknown>, key: string): number | undefined {
  if (body[key] === undefined) return undefined;
  if (typeof body[key] !== "number" || !Number.isSafeInteger(body[key])) {
    throw new AdminInputError("INVALID_REQUEST", `${key} is invalid`);
  }
  return body[key];
}

function readOptionalString(body: Record<string, unknown>, key: string, max: number): string {
  return typeof body[key] === "string" ? body[key].slice(0, max) : "";
}

function readLimit(value: unknown, fallback: number): number {
  const limit = typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : fallback;
}

function sendAdminError(response: Response, error: unknown): void {
  if (error instanceof AdminInputError) {
    response.status(400).json({ ok: false, code: error.code });
    return;
  }
  response.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
}
