import path from "node:path";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeScreenShareIceServers, type ScreenShareIceServer } from "./server/screen-share.js";
import { SkinRegistry } from "./admin/skin-registry.js";

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
const SCREEN_SHARE_ICE_SERVERS = readScreenShareIceServers(process.env.WEBSPEAK_SCREEN_SHARE_ICE_SERVERS);

async function main() {
  const [{ createLogger }, { createWebServer }, { APP_PORT }, { WebSpeakDatabase }, { loadOrCreateMasterSecret }, { AdminService }, { JoinTicketStore }] = await Promise.all([
    import("./logger.js"),
    import("./server/server.js"),
    import("./constants.js"),
    import("./persistence/database.js"),
    import("./security/master-secret.js"),
    import("./admin/admin-service.js"),
    import("./server/join-ticket.js"),
  ]);
  const logger = createLogger(LOG_DIR);
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

  logger.info({ dataDir: DATA_DIR }, "Starting WebSpeak server");

  const hasCert = existsSync(path.join(CERT_DIR, "cert.pem"));

  const webServer = createWebServer({
    port: APP_PORT,
    version: APP_VERSION,
    logFile: path.join(LOG_DIR, "webspeak.log"),
    staticDir: STATIC_DIR,
    certDir: hasCert ? CERT_DIR : undefined,
    voiceBridgeOptions: {
      joinTickets,
      webRtc: () => adminService.getWebRtcAudioOptions(),
      screenShareIceServers: () => SCREEN_SHARE_ICE_SERVERS,
    },
    adminService,
    skinRegistry: new SkinRegistry(path.join(DATA_DIR, "skins")),
    logger,
  });

  await webServer.start();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    await webServer.stop();
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
