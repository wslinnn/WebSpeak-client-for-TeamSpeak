import express from "express";
import compression from "compression";
import { createHash } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { VoiceBridge, type VoiceBridgeOptions } from "./voice-bridge.js";
import type { Logger } from "../logger.js";
import type { TeamSpeakTarget } from "../domain/teamspeak-target.js";
import { formatTeamSpeakConnectionTarget, parseTeamSpeakConnectionTarget } from "../domain/teamspeak-connection-target.js";
import { resolveTeamSpeakTarget, TeamSpeakAliasLookupError } from "./teamspeak-alias.js";
import { createAdminRouter } from "../admin/admin-router.js";
import type { AdminService } from "../admin/admin-service.js";
import { AdminSessionStore } from "../admin/admin-session.js";
import { isSafeOpenTargetForPrefill, resolveSafeOpenTarget } from "../security/open-target-policy.js";
import { identityFromString } from "@echosixhiya/teamspeak-client";
import { JoinRateLimiter } from "./join-rate-limit.js";
import { SkinDownloadRateLimiter } from "./skin-download-rate-limit.js";
import { rateLimitPeerKey, resolveClientAddress } from "./client-ip.js";
import { createProxyHint } from "./proxy-hint.js";
import type { ServerPasswordGuard } from "./server-password-guard.js";
import type { AndroidReleaseInfo } from "./downloads.js";
import { teamSpeakTargetKey } from "../domain/teamspeak-target.js";
import type { SkinRegistry } from "../admin/skin-registry.js";

export interface WebServerOptions {
  port: number;
  version?: string;
  logFile?: string;
  staticDir?: string;
  certDir?: string; // path to cert.pem + key.pem for HTTPS
  voiceBridgeOptions: VoiceBridgeOptions;
  adminService: AdminService;
  skinRegistry?: SkinRegistry;
  logger: Logger;
  trustProxy?: boolean;
  serverPasswordGuard: ServerPasswordGuard;
  /** Latest Android-client release metadata for the download page; absent on
   *  deployments that do not ship the lookup. */
  androidReleaseLookup?: () => Promise<AndroidReleaseInfo | null>;
}

export interface WebServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createWebServer(options: WebServerOptions): WebServer {
  // Bare-metal installs may skip NODE_ENV; default it so Express error pages
  // never include stack traces. Docker images already set it explicitly.
  if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
  const app = express();
  app.disable("x-powered-by");
  const logger = options.logger.child({ component: "web" });
  const trustProxy = options.trustProxy === true;
  if (trustProxy) app.set("trust proxy", true);
  // Without a declared trusted proxy, forwarded headers are ignored by design
  // — which renders a same-host proxy invisible: every client looks like
  // 127.0.0.1 in logs and shares one rate-limit bucket. Surface that
  // misconfiguration once instead of letting it degrade silently.
  if (!trustProxy) {
    const hintProxyMisconfigured = createProxyHint((message) => logger.warn(message));
    app.use((request, _response, next) => {
      hintProxyMisconfigured(request.socket.remoteAddress, request.headers["x-forwarded-for"]);
      next();
    });
  }

  let server: ReturnType<typeof createHttpsServer> | ReturnType<typeof createHttpServer>;

  if (options.certDir) {
    const cert = readFileSync(path.join(options.certDir, "cert.pem"));
    const key = readFileSync(path.join(options.certDir, "key.pem"));
    server = createHttpsServer({ cert, key }, app);
    logger.info("HTTPS enabled");
  } else {
    server = createHttpServer(app);
  }

  // Defense-in-depth headers for every response, including API errors and
  // static assets. style-src keeps 'unsafe-inline' because skins inject their
  // CSS as a style element and Vue writes style attributes; the frontend has
  // no HTML sink, so the style channel is not an injection path. HSTS is only
  // meaningful on secure responses — including proxy-terminated TLS once
  // trust proxy is enabled. img-src/font-src allow blob: because compiled skin
  // packs reference their bundled assets as blob: URLs (created client-side
  // from whitelisted in-package files, so they are same-origin by
  // construction); media-src blob: serves the microphone-test playback
  // element, and script-src 'wasm-unsafe-eval' is required by the optional
  // RNNoise denoiser WASM module. connect-src is deliberately narrowed to
  // 'self': the voice WebSocket is always same-origin (location.host) and the
  // browser floor (WebCodecs-capable) postdates the Safari 15.4 fix for
  // 'self' matching websocket schemes.
  app.use((request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
        + "img-src 'self' data: blob:; font-src 'self' blob:; media-src 'self' blob:; "
        + "connect-src 'self'; "
        + "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    if (request.secure) response.setHeader("Strict-Transport-Security", "max-age=31536000");
    next();
  });

  app.use(express.json({ limit: "100kb" }));
  // Voice and API traffic shares a 3 Mbit/s uplink; compressing the JSON API
  // and static assets is close to a free tripling of its capacity. WebSocket
  // upgrades and binary downloads (skins) are not compressible types and stay
  // untouched by the default filter.
  app.use(compression());

  const voiceBridge = new VoiceBridge(options.voiceBridgeOptions, logger);
  const adminSessions = new AdminSessionStore();
  const joinRateLimiter = new JoinRateLimiter();
  const skinDownloadLimiter = new SkinDownloadRateLimiter();
  const skinPreviewLimiter = new SkinDownloadRateLimiter();
  const startedAt = Date.now();
  // Limiter key for a request: the client IP when trust proxy is configured,
  // otherwise the socket address, aggregated to a /64 for IPv6.
  const peerKey = (request: express.Request): string => {
    const header = request.headers["x-forwarded-for"];
    return rateLimitPeerKey(resolveClientAddress(
      request.socket.remoteAddress,
      Array.isArray(header) ? header[0] : header,
      trustProxy,
    ));
  };

  const healthHandler: express.RequestHandler = (_request, response) => {
    response.json({ status: "ok", version: options.version ?? "0.1.0" });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  app.get("/api/public-config", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const publicConfig = options.adminService.getPublicConfig();
    let target = typeof publicConfig.target === "string" ? publicConfig.target : "";
    let targetPrefillBlocked = false;
    if (publicConfig.accessMode === "open" && target.trim()) {
      try {
        targetPrefillBlocked = !await isSafeOpenTargetForPrefill(await resolveTeamSpeakTarget(target));
      } catch {
        targetPrefillBlocked = true;
      }
      if (targetPrefillBlocked) target = "";
    }
    response.json({
      ...publicConfig,
      target,
      targetPrefillBlocked,
    });
  });

  app.get("/api/skins", async (_request, response) => {
    response.setHeader("Cache-Control", "no-cache");
    response.json({
      skins: await options.skinRegistry?.list() ?? [],
      defaultSkinId: await options.skinRegistry?.getDefaultSkinId() ?? "builtin.light",
    });
  });

  // Cached release metadata for the download page. The lookup itself throttles
  // GitHub to one call per TTL, so visitors never share one API rate budget.
  if (options.androidReleaseLookup) {
    app.get("/api/downloads/android", async (_request, response) => {
      response.setHeader("Cache-Control", "public, max-age=120");
      const release = await options.androidReleaseLookup!();
      response.json({ ok: true, release });
    });
  }

  app.get("/api/skins/:id/package", async (request, response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    // Skins are unauthenticated downloads of up to 20 MB; without a per-peer
    // bound a looping client monopolizes the 3 Mbit/s uplink for minutes.
    if (!skinDownloadLimiter.allow(peerKey(request))) {
      response.status(429).json({ ok: false, code: "RATE_LIMITED" });
      return;
    }
    const archive = await options.skinRegistry?.readArchive(id);
    if (!archive) {
      response.status(404).json({ ok: false, code: "SKIN_NOT_FOUND" });
      return;
    }
    // A package for a given id only changes when an administrator re-uploads
    // it, so browsers may revalidate with the content hash instead of paying
    // for the full download again.
    const etag = `"${createHash("sha256").update(archive).digest("hex").slice(0, 32)}"`;
    response.setHeader("Cache-Control", "public, max-age=300");
    response.setHeader("ETag", etag);
    if (request.headers["if-none-match"] === etag) {
      response.status(304).end();
      return;
    }
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("Content-Disposition", `attachment; filename="${id}.wskin"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(archive);
  });

  app.get("/api/skins/:id/preview", async (request, response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    // Previews are unauthenticated images up to the per-file skin asset cap;
    // bound them like packages so a looping client cannot monopolize the
    // 3 Mbit/s uplink either.
    if (!skinPreviewLimiter.allow(peerKey(request))) {
      response.status(429).json({ ok: false, code: "RATE_LIMITED" });
      return;
    }
    const preview = await options.skinRegistry?.readPreview(id);
    if (!preview) {
      response.status(404).end();
      return;
    }
    response.setHeader("Cache-Control", "public, max-age=300");
    response.setHeader("Content-Type", preview.mimeType);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(preview.bytes);
  });

  app.post("/api/join-ticket", async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!request.is("application/json") || !isSameOrigin(request)) {
      response.status(403).json({ ok: false, code: "ORIGIN_REJECTED" });
      return;
    }
    if (!options.adminService.isInitialized()) {
      response.status(503).json({ ok: false, code: "NOT_INITIALIZED" });
      return;
    }
    if (!joinRateLimiter.allow(peerKey(request))) {
      response.status(429).json({ ok: false, code: "RATE_LIMITED" });
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    // In-session reconnect: an opaque token from the `connected` message
    // restores the original join payload (target, password, nickname, channel,
    // identity) without a new TeamSpeak join. Same-origin and the join
    // rate limit above still apply; an unknown/expired token is a plain 400 so
    // a stale browser tab simply falls back to the normal join form.
    const reconnectToken = typeof body.reconnect === "string" ? body.reconnect.trim().slice(0, 128) : "";
    if (reconnectToken) {
      const record = options.voiceBridgeOptions.reconnectTickets?.consume(reconnectToken);
      if (!record) {
        response.status(400).json({ ok: false, code: "RECONNECT_INVALID" });
        return;
      }
      // A predecessor still in the detached pool means the kept TeamSpeak
      // session is claimed back (zero TeamSpeak reconnects). Anything else —
      // expired grace, dead session, server restart — rebuilds a fresh
      // session and evicts the zombie predecessor.
      const resumable = voiceBridge.isDetachedResumable(record.entryId);
      const ticket = options.voiceBridgeOptions.joinTickets.create({
        ...record.payload,
        ...(resumable ? { resumeOfEntryId: record.entryId } : { reconnectOfEntryId: record.entryId }),
      });
      response.status(201).json({ ok: true, ticket });
      return;
    }
    const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 30) : "";
    const requestedChannel = typeof body.channel === "string" ? body.channel.trim().slice(0, 100) : "";
    const requestedIdentity = typeof body.identity === "string" && body.identity.length <= 8192 ? body.identity : "";
    let identity: string | undefined;
    if (requestedIdentity) {
      try {
        identityFromString(requestedIdentity);
        identity = requestedIdentity;
      } catch {
        // A stale/corrupt local identity must not block a normal ephemeral join.
      }
    }
    if (!nickname) {
      response.status(400).json({ ok: false, code: "INVALID_NICKNAME" });
      return;
    }

    const policy = options.adminService.getConnectionPolicy();
    let targetText = policy.defaultTarget;
    let target: TeamSpeakTarget;
    let serverPassword = policy.serverPassword;
    // Whether this request brought its own password (an open-mode custom
    // target or a fixed-mode password retry). Only those attempts can probe
    // for a server's password, so only those are subject to the shared
    // wrong-password guard.
    let usesUserPassword = false;
    try {
      if (policy.accessMode === "open" && typeof body.target === "string" && body.target.trim()) {
        targetText = formatTeamSpeakConnectionTarget(parseTeamSpeakConnectionTarget(body.target));
        const isDefault = targetText === policy.defaultTarget;
        if (!isDefault) serverPassword = typeof body.serverPassword === "string" ? body.serverPassword.slice(0, 512) : "";
        else if (typeof body.serverPassword === "string" && body.serverPassword.trim()) serverPassword = body.serverPassword.slice(0, 512);
        usesUserPassword = typeof body.serverPassword === "string" && body.serverPassword.trim().length > 0;
      } else if (policy.accessMode === "fixed" && typeof body.serverPassword === "string" && body.serverPassword.trim()) {
        // The fixed target remains administrator-controlled, but a user may
        // retry its server password after the gateway reports that one is
        // required. The target itself is never taken from this request.
        serverPassword = body.serverPassword.slice(0, 512);
        usesUserPassword = true;
      }
      target = await resolveTeamSpeakTarget(targetText);
      // Open-mode defaults are user targets too; validate the resolved address
      // and pass that exact IP to the voice connection to prevent DNS rebinding.
      if (policy.accessMode === "open") target = await resolveSafeOpenTarget(target);
    } catch (error) {
      response.status(400).json({ ok: false, code: error instanceof TeamSpeakAliasLookupError ? "HOST_NOT_FOUND" : "TARGET_NOT_ALLOWED" });
      return;
    }
    if (usesUserPassword) {
      const blockedForMs = options.serverPasswordGuard.blockedForMs(teamSpeakTargetKey(target));
      if (blockedForMs > 0) {
        response.setHeader("Retry-After", String(Math.ceil(blockedForMs / 1000)));
        response.status(429).json({ ok: false, code: "PASSWORD_RETRY_LATER", retryAfterMs: blockedForMs });
        return;
      }
    }

    const ticket = options.voiceBridgeOptions.joinTickets.create({
      target,
      serverPassword,
      nickname,
      ...(requestedChannel ? { channel: requestedChannel } : {}),
      ...(identity ? { identity, rememberIdentity: true } : body.rememberIdentity === true ? { rememberIdentity: true } : {}),
    });
    response.status(201).json({ ok: true, ticket });
  });

  app.use("/api/admin", createAdminRouter({
    service: options.adminService,
    sessions: adminSessions,
    logger,
    trustProxy,
    getActiveSessions: () => voiceBridge.getActiveCount(),
    getPeakSessions: () => voiceBridge.getPeakCount(),
    getCreatedSessions: () => voiceBridge.getCreatedCount(),
    getSessionSummaries: () => voiceBridge.getSessionSummaries(),
    getVoiceTransportStats: () => voiceBridge.getTransportOutcomes(),
    terminateSession: (id) => voiceBridge.terminateSession(id),
    skinRegistry: options.skinRegistry,
    version: options.version,
    logFile: options.logFile,
    startedAt,
  }));

  // Serve static frontend
  if (options.staticDir) {
    app.use(express.static(options.staticDir, {
      setHeaders(res, filePath) {
        // Vite emits content-hashed filenames for build outputs (assets/ and
        // other bundles); they can be cached forever. Everything else —
        // index.html and plain public/ files — must revalidate.
        if (/-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/.test(path.basename(filePath))) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }));
    app.get(/^(?!\/api|\/ws)/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(options.staticDir!, "index.html"));
    });
  }

  voiceBridge.attach(server);

  return {
    start(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(options.port, () => {
          logger.info({ port: options.port }, "Web server started");
          resolve();
        });
      });
    },
    async stop(): Promise<void> {
      await voiceBridge.shutdown();
      adminSessions.clear();
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSameOrigin(request: express.Request): boolean {
  const origin = request.header("origin");
  const host = request.header("host");
  try {
    return Boolean(origin && host && new URL(origin).host === host);
  } catch {
    return false;
  }
}
