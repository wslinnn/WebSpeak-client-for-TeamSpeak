import path from "node:path";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeScreenShareIceServers, type ScreenShareIceServer } from "./server/screen-share.js";
import { startStunServer } from "./server/stun-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");
const CERT_DIR = path.join(ROOT_DIR, "certs");
// Production images mount the persistent volume at /data. Source installs
// keep the historical project-local data directory unless overridden.
const DATA_DIR = process.env.WEBSPEAK_DATA_DIR?.trim() || path.join(ROOT_DIR, "data");
const LOG_DIR = path.join(DATA_DIR, "logs");
const STATIC_DIR = path.join(ROOT_DIR, "web", "dist");
const APP_VERSION = readPackageVersion();
// The gateway answers STUN bindings itself so screen-share peers get a
// reachable address-discovery server without depending on TeamSpeak's
// foreign public STUN. WEBSPEAK_STUN_PORT=0 disables the listener.
const STUN_PORT = readStunPort(process.env.WEBSPEAK_STUN_PORT);
const ENV_SCREEN_SHARE_ICE_SERVERS = readScreenShareIceServers(process.env.WEBSPEAK_SCREEN_SHARE_ICE_SERVERS);
const ENV_SCREEN_SHARE_ICE_CONFIGURED = Boolean(process.env.WEBSPEAK_SCREEN_SHARE_ICE_SERVERS?.trim());

async function main() {
  const [{ createLogger }, { createWebServer }, { APP_PORT }, { WebSpeakDatabase }, { loadOrCreateMasterSecret }, { AdminService }, { JoinTicketStore }, { ReconnectTicketStore }, { ServerPasswordGuard }, { createAndroidReleaseLookup }] = await Promise.all([
    import("./logger.js"),
    import("./server/server.js"),
    import("./constants.js"),
    import("./persistence/database.js"),
    import("./security/master-secret.js"),
    import("./admin/admin-service.js"),
    import("./server/join-ticket.js"),
    import("./server/reconnect-ticket.js"),
    import("./server/server-password-guard.js"),
    import("./server/downloads.js"),
  ]);
  // WEBSPEAK_LOG_LEVEL=debug restores verbose file logging (SDK protocol
  // chatter included); the default keeps the rotating file at info.
  const fileLevel = process.env.WEBSPEAK_LOG_LEVEL?.trim().toLowerCase() === "debug" ? "debug" as const : "info" as const;
  const logger = createLogger(LOG_DIR, { fileLevel });
  // A stray rejection on one async path (a WS connection handler, an admin
  // request) must not take every live voice session down with it: Node's
  // default turns an unhandled rejection into a process crash. Log loudly
  // and keep serving; uncaughtException keeps the default crash semantics.
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason) }, "Unhandled promise rejection");
  });
  const database = new WebSpeakDatabase(path.join(DATA_DIR, "webspeak.db"));
  const masterSecret = loadOrCreateMasterSecret(path.join(DATA_DIR, "master.key"));
  const adminService = new AdminService(
    database,
    masterSecret,
    logger,
    CONFIG_PATH,
    undefined,
    APP_VERSION,
  );
  await adminService.initialize();
  removeObsoleteBootstrapFile();
  const joinTickets = new JoinTicketStore();
  const reconnectTickets = new ReconnectTicketStore();
  // WEBSPEAK_TRUST_PROXY=1 declares a reverse proxy in front of the gateway:
  // forwarded headers then identify clients for rate limits and logs, and
  // proxy-terminated TLS keeps secure cookies and HSTS working.
  const trustProxyEnv = process.env.WEBSPEAK_TRUST_PROXY?.trim().toLowerCase();
  const trustProxy = trustProxyEnv === "1" || trustProxyEnv === "true";
  // WEBSPEAK_TRUSTED_PROXIES names proxies other than the same-host one
  // (comma/space separated IPs or CIDRs). Forwarded headers are believed only
  // from a declared peer: anyone can set them on the upgrade request, and the
  // address they choose would otherwise land in the audit trail.
  const trustedProxies = readTrustedProxies(process.env.WEBSPEAK_TRUSTED_PROXIES);
  // One guard instance serves both sides: the web endpoint consults it before
  // issuing tickets, the voice bridge records wrong-password failures into it.
  const serverPasswordGuard = new ServerPasswordGuard();
  // WEBSPEAK_ANDROID_REPO=owner/name points the download page's Android card
  // at another releases repository; the default is the companion app's.
  const androidReleaseLookup = createAndroidReleaseLookup({ repo: process.env.WEBSPEAK_ANDROID_REPO?.trim() || undefined });

  logger.info({ dataDir: DATA_DIR }, "Starting WebSpeak server");

  const selfStun = STUN_PORT > 0 ? await startStunServer({ port: STUN_PORT, logger }) : null;

  const hasCert = existsSync(path.join(CERT_DIR, "cert.pem"));

  // Screen-share ICE list precedence: explicit env config wins, then the
  // admin-managed list (saved from the console), then the gateway's own STUN
  // (advertised at the voice public host when set, otherwise at the address
  // this very connection arrived at — public-VPS deployments configure
  // neither), then TeamSpeak's public STUN as fallback.
  const screenShareIceServers = (advertisedHost?: string): ScreenShareIceServer[] => {
    if (ENV_SCREEN_SHARE_ICE_CONFIGURED) return ENV_SCREEN_SHARE_ICE_SERVERS;
    const adminConfigured = database.getMeta("screen_share_ice_servers")?.trim();
    if (adminConfigured) return readScreenShareIceServers(adminConfigured);
    const host = adminService.getWebRtcAudioOptions().publicHost?.trim() || advertisedHost || "";
    const hostLiteral = host.includes(":") ? `[${host}]` : host;
    const servers: ScreenShareIceServer[] = [];
    if (selfStun && hostLiteral) servers.push({ urls: `stun:${hostLiteral}:${STUN_PORT}` });
    return normalizeScreenShareIceServers(servers.length ? servers : undefined);
  };

  const webServer = createWebServer({
    port: APP_PORT,
    version: APP_VERSION,
    logFile: path.join(LOG_DIR, "webspeak.log"),
    staticDir: STATIC_DIR,
    certDir: hasCert ? CERT_DIR : undefined,
    voiceBridgeOptions: {
      joinTickets,
      reconnectTickets,
      webRtc: () => adminService.getWebRtcAudioOptions(),
      screenShareIceServers,
      trustProxy,
      trustedProxies,
      serverPasswordGuard,
    },
    adminService,
        logger,
    trustProxy,
    trustedProxies,
    serverPasswordGuard,
    androidReleaseLookup,
  });

  await webServer.start();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    await webServer.stop();
    await selfStun?.close();
    database.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" && packageJson.version ? packageJson.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

function removeObsoleteBootstrapFile(): void {
  try {
    unlinkSync(path.join(DATA_DIR, "bootstrap"));
  } catch (error: unknown) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

/** Split the declared proxy list; an invalid entry surfaces as a startup
 *  failure from createTrustedProxies rather than being silently ignored. */
function readTrustedProxies(value: string | undefined): string[] | undefined {
  const entries = value?.split(/[\s,]+/).filter(Boolean) ?? [];
  return entries.length ? entries : undefined;
}

function readStunPort(value: string | undefined): number {
  const raw = value?.trim();
  if (!raw) return 3478;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : 3478;
}

function readScreenShareIceServers(value: string | undefined): ScreenShareIceServer[] {
  const raw = value?.trim();
  if (!raw) return normalizeScreenShareIceServers();
  try {
    const parsed: unknown = JSON.parse(raw);
    return normalizeScreenShareIceServers(Array.isArray(parsed) ? parsed : undefined);
  } catch {
    // A simple comma/space-separated list is convenient for STUN-only setups.
    return normalizeScreenShareIceServers(raw.split(/[\s,]+/).filter(Boolean).map((urls) => ({ urls })));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
