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
}

export interface WebServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createWebServer(options: WebServerOptions): WebServer {
  const app = express();
  const logger = options.logger.child({ component: "web" });

  let server: ReturnType<typeof createHttpsServer> | ReturnType<typeof createHttpServer>;

  if (options.certDir) {
    const cert = readFileSync(path.join(options.certDir, "cert.pem"));
    const key = readFileSync(path.join(options.certDir, "key.pem"));
    server = createHttpsServer({ cert, key }, app);
    logger.info("HTTPS enabled");
  } else {
    server = createHttpServer(app);
  }

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
  const startedAt = Date.now();

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

  app.get("/api/skins/:id/package", async (request, response) => {
    const id = typeof request.params.id === "string" ? request.params.id : "";
    // Skins are unauthenticated downloads of up to 20 MB; without a per-peer
    // bound a looping client monopolizes the 3 Mbit/s uplink for minutes.
    const peer = request.socket.remoteAddress ?? "unknown";
    if (!skinDownloadLimiter.allow(peer)) {
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
    if (!joinRateLimiter.allow(request.socket.remoteAddress ?? "unknown")) {
      response.status(429).json({ ok: false, code: "RATE_LIMITED" });
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const nickname = typeof body.nickname === "string" ? body.nickname.trim().slice(0, 30) : "";
    const requestedChannel = typeof body.channel === "string" ? body.channel.trim().slice(0, 100) : "";
    const inviteToken = typeof body.invite === "string" ? body.invite.trim().slice(0, 128) : "";
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
    const managedInvite = inviteToken ? options.adminService.getManagedInvite(inviteToken) : null;
    if (inviteToken && !managedInvite) {
      response.status(400).json({ ok: false, code: "INVITE_INVALID" });
      return;
    }
    let targetText = managedInvite?.target ?? policy.defaultTarget;
    let target: TeamSpeakTarget;
    let serverPassword = policy.serverPassword;
    const channel = requestedChannel || managedInvite?.channel || "";
    try {
      if (!managedInvite) {
        if (policy.accessMode === "open" && typeof body.target === "string" && body.target.trim()) {
          targetText = formatTeamSpeakConnectionTarget(parseTeamSpeakConnectionTarget(body.target));
          const isDefault = targetText === policy.defaultTarget;
          if (!isDefault) serverPassword = typeof body.serverPassword === "string" ? body.serverPassword.slice(0, 512) : "";
          else if (typeof body.serverPassword === "string" && body.serverPassword.trim()) serverPassword = body.serverPassword.slice(0, 512);
        } else if (policy.accessMode === "fixed" && typeof body.serverPassword === "string" && body.serverPassword.trim()) {
          // The fixed target remains administrator-controlled, but a user may
          // retry its server password after the gateway reports that one is
          // required. The target itself is never taken from this request.
          serverPassword = body.serverPassword.slice(0, 512);
        }
      }
      target = await resolveTeamSpeakTarget(targetText);
      // Open-mode defaults are user targets too; validate the resolved address
      // and pass that exact IP to the voice connection to prevent DNS rebinding.
      if (!managedInvite && policy.accessMode === "open") target = await resolveSafeOpenTarget(target);
    } catch (error) {
      response.status(400).json({ ok: false, code: error instanceof TeamSpeakAliasLookupError ? "HOST_NOT_FOUND" : "TARGET_NOT_ALLOWED" });
      return;
    }

    if (inviteToken) {
      const consumedInvite = options.adminService.consumeManagedInvite(inviteToken);
      if (!consumedInvite) {
        response.status(400).json({ ok: false, code: "INVITE_INVALID" });
        return;
      }
      serverPassword = consumedInvite.serverPassword;
    }

    const ticket = options.voiceBridgeOptions.joinTickets.create({
      target,
      serverPassword,
      nickname,
      ...(channel ? { channel } : {}),
      ...(identity ? { identity, rememberIdentity: true } : body.rememberIdentity === true ? { rememberIdentity: true } : {}),
    });
    response.status(201).json({ ok: true, ticket });
  });

  app.use("/api/admin", createAdminRouter({
    service: options.adminService,
    sessions: adminSessions,
    logger,
    getActiveSessions: () => voiceBridge.getActiveCount(),
    getPeakSessions: () => voiceBridge.getPeakCount(),
    getCreatedSessions: () => voiceBridge.getCreatedCount(),
    getSessionSummaries: () => voiceBridge.getSessionSummaries(),
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
