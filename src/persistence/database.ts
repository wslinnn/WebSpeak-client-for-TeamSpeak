import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AdminCredential } from "../security/admin-password.js";
import { DEFAULT_WEBRTC_UDP_PORT_RANGE } from "../constants.js";
import type { TeamSpeakProtocol } from "../domain/teamspeak-target.js";
import { backupPreMigrationSchema, runSchemaMigrations } from "./database-migrations.js";

export { DATABASE_SCHEMA_VERSION } from "./database-migrations.js";
export type AccessMode = "fixed" | "open";

export interface PersistedSettings {
  siteName: string;
  welcomeText: string;
  welcomeTextEn: string;
  welcomeTextDe: string;
  welcomeTextRu: string;
  welcomeTextJa: string;
  accessMode: AccessMode;
  tsHost: string;
  tsPort: number;
  tsTarget: string | null;
  tsPasswordEncrypted: string | null;
  detectedProtocol: TeamSpeakProtocol | null;
  lastTestAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestError: string | null;
  webRtcEnabled: boolean;
  webRtcPublicHost: string;
  webRtcIpv6Enabled: boolean;
  webRtcStunServer: string;
  webRtcUdpStart: number;
  webRtcUdpEnd: number;
  updatedAt: string;
}

export interface SettingsUpdate {
  siteName: string;
  welcomeText: string;
  welcomeTextEn?: string;
  welcomeTextDe?: string;
  welcomeTextRu?: string;
  welcomeTextJa?: string;
  accessMode: AccessMode;
  tsHost: string;
  tsPort: number;
  tsTarget?: string | null;
  tsPasswordEncrypted: string | null;
  webRtcEnabled: boolean;
  webRtcPublicHost?: string;
  webRtcIpv6Enabled?: boolean;
  webRtcStunServer?: string;
  webRtcUdpStart?: number;
  webRtcUdpEnd?: number;
}

interface SettingsRow extends Record<string, unknown> {
  site_name: string;
  welcome_text: string;
  welcome_text_en: string;
  welcome_text_de: string;
  welcome_text_ru: string;
  welcome_text_ja: string;
  access_mode: string;
  ts_host: string;
  ts_port: number;
  ts_target: string | null;
  ts_password_encrypted: string | null;
  detected_protocol: string | null;
  last_test_at: string | null;
  last_test_latency_ms: number | null;
  last_test_error: string | null;
  webrtc_enabled: number;
  webrtc_public_host: string;
  webrtc_ipv6_enabled: number;
  webrtc_stun_server: string;
  webrtc_udp_start: number;
  webrtc_udp_end: number;
  updated_at: string;
}

// Audit rows are operational history, not an archive: cap them at boot so a
// long-lived instance cannot grow the database without bound.
const AUDIT_EVENT_RETENTION = 5_000;

export class WebSpeakDatabase {
  private readonly database: DatabaseSync;

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const existed = existsSync(path);
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate(existed);
    this.pruneAuditEvents();
  }

  close(): void {
    this.database.close();
  }

  get schemaVersion(): number {
    return Number((this.database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  }

  hasAdmin(): boolean {
    return Boolean(this.database.prepare("SELECT 1 AS present FROM admin_credentials WHERE id = 1").get());
  }

  getAdminCredential(): AdminCredential | null {
    const row = this.database.prepare("SELECT credential_json FROM admin_credentials WHERE id = 1").get() as { credential_json?: string } | undefined;
    if (!row?.credential_json) return null;
    const credential = JSON.parse(row.credential_json) as Partial<AdminCredential>;
    return {
      ...credential,
      version: 1,
      username: typeof credential.username === "string" && credential.username ? credential.username : "admin",
      mustChangePassword: credential.mustChangePassword === true,
    } as AdminCredential;
  }

  initializeAdmin(credential: AdminCredential, settings: SettingsUpdate): void {
    this.transaction(() => {
      if (this.hasAdmin()) throw new Error("WebSpeak is already initialized");
      const now = new Date().toISOString();
      this.database.prepare(
        "INSERT INTO admin_credentials (id, credential_json, created_at, updated_at) VALUES (1, ?, ?, ?)",
      ).run(JSON.stringify(credential), now, now);
      this.writeSettings(settings, now);
      this.insertAudit("ADMIN_INITIALIZED", { accessMode: settings.accessMode, target: `${settings.tsHost}:${settings.tsPort}` }, now);
    });
  }

  updateAdminCredential(credential: AdminCredential): void {
    const now = new Date().toISOString();
    this.database.prepare(
      "UPDATE admin_credentials SET credential_json = ?, updated_at = ? WHERE id = 1",
    ).run(JSON.stringify(credential), now);
  }

  getSettings(): PersistedSettings {
    const row = this.database.prepare("SELECT * FROM settings WHERE id = 1").get() as SettingsRow;
    return {
      siteName: row.site_name,
      welcomeText: row.welcome_text,
      welcomeTextEn: row.welcome_text_en,
      welcomeTextDe: row.welcome_text_de,
      welcomeTextRu: row.welcome_text_ru,
      welcomeTextJa: row.welcome_text_ja,
      accessMode: row.access_mode === "open" ? "open" : "fixed",
      tsHost: row.ts_host,
      tsPort: row.ts_port,
      tsTarget: row.ts_target,
      tsPasswordEncrypted: row.ts_password_encrypted,
      detectedProtocol: row.detected_protocol === "ts3" || row.detected_protocol === "ts6" ? row.detected_protocol : null,
      lastTestAt: row.last_test_at,
      lastTestLatencyMs: row.last_test_latency_ms,
      lastTestError: row.last_test_error,
      webRtcEnabled: row.webrtc_enabled === 1,
      webRtcPublicHost: row.webrtc_public_host,
      webRtcIpv6Enabled: row.webrtc_ipv6_enabled === 1,
      webRtcStunServer: row.webrtc_stun_server,
      webRtcUdpStart: row.webrtc_udp_start,
      webRtcUdpEnd: row.webrtc_udp_end,
      updatedAt: row.updated_at,
    };
  }

  updateSettings(settings: SettingsUpdate, auditEvent = "SETTINGS_CHANGED"): void {
    const now = new Date().toISOString();
    this.transaction(() => {
      this.writeSettings(settings, now);
      this.insertAudit(auditEvent, { accessMode: settings.accessMode, target: `${settings.tsHost}:${settings.tsPort}` }, now);
    });
  }

  recordConnectionTest(result: {
    protocol: TeamSpeakProtocol | null;
    latencyMs: number | null;
    error: string | null;
  }): void {
    this.database.prepare(
      `UPDATE settings
       SET detected_protocol = ?, last_test_at = ?, last_test_latency_ms = ?, last_test_error = ?
       WHERE id = 1`,
    ).run(result.protocol, new Date().toISOString(), result.latencyMs, result.error);
  }

  clearConnectionTest(): void {
    this.database.exec(
      "UPDATE settings SET detected_protocol = NULL, last_test_at = NULL, last_test_latency_ms = NULL, last_test_error = NULL WHERE id = 1",
    );
  }

  exportBackup(): Buffer {
    const exportPath = `${this.path}.export-${randomBytes(8).toString("hex")}.db`;
    try {
      const escapedPath = exportPath.replaceAll("'", "''");
      this.database.exec(`VACUUM INTO '${escapedPath}'`);
      return readFileSync(exportPath);
    } finally {
      try { unlinkSync(exportPath); } catch { /* best effort cleanup */ }
    }
  }

  getMeta(key: string): string | null {
    const row = this.database.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.database.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }

  addAudit(event: string, details: Record<string, unknown> = {}): void {
    this.insertAudit(event, details, new Date().toISOString());
  }

  recentAudit(limit = 8): Array<{ event: string; createdAt: string; details: Record<string, string | number> }> {
    const normalizedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const rows = this.database.prepare(
      "SELECT event, created_at, details_json FROM audit_events ORDER BY id DESC LIMIT ?",
    ).all(normalizedLimit) as Array<{ event: string; created_at: string; details_json: string }>;
    return rows.map((row) => {
      const details: Record<string, string | number> = {};
      try {
        const parsed = JSON.parse(row.details_json) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string" || typeof value === "number") details[key] = value;
          }
        }
      } catch {
        // Malformed details should never take the whole audit feed down.
      }
      return { event: row.event, createdAt: row.created_at, details };
    });
  }

  private migrate(existed: boolean): void {
    if (existed && this.schemaVersion > 0) {
      backupPreMigrationSchema(this.path, this.schemaVersion);
    }
    runSchemaMigrations(this.database, this.path, (action) => this.transaction(action));
  }

  private writeSettings(settings: SettingsUpdate, now: string): void {
    this.database.prepare(
      `UPDATE settings SET
         site_name = ?, welcome_text = ?, welcome_text_en = ?, welcome_text_de = ?, welcome_text_ru = ?, welcome_text_ja = ?, access_mode = ?, ts_host = ?, ts_port = ?, ts_target = ?,
         ts_password_encrypted = ?, webrtc_enabled = ?, webrtc_public_host = ?, webrtc_ipv6_enabled = ?, webrtc_stun_server = ?, webrtc_udp_start = ?,
         webrtc_udp_end = ?, updated_at = ?
       WHERE id = 1`,
    ).run(
      settings.siteName,
      settings.welcomeText,
      settings.welcomeTextEn ?? "",
      settings.welcomeTextDe ?? "",
      settings.welcomeTextRu ?? "",
      settings.welcomeTextJa ?? "",
      settings.accessMode,
      settings.tsHost,
      settings.tsPort,
      settings.tsTarget ?? null,
      settings.tsPasswordEncrypted,
      settings.webRtcEnabled ? 1 : 0,
      settings.webRtcPublicHost ?? "",
      settings.webRtcIpv6Enabled ? 1 : 0,
      settings.webRtcStunServer ?? "",
      settings.webRtcUdpStart ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[0],
      settings.webRtcUdpEnd ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[1],
      now,
    );
  }

  private insertAudit(event: string, details: Record<string, unknown>, now: string): void {
    this.database.prepare(
      "INSERT INTO audit_events (event, details_json, created_at) VALUES (?, ?, ?)",
    ).run(event, JSON.stringify(details), now);
  }

  /** Keeps only the newest AUDIT_EVENT_RETENTION audit rows; runs once per
   *  boot — audit writes are low-frequency admin events, so that is enough. */
  private pruneAuditEvents(): void {
    this.database.prepare(
      "DELETE FROM audit_events WHERE id NOT IN (SELECT id FROM audit_events ORDER BY id DESC LIMIT ?)",
    ).run(AUDIT_EVENT_RETENTION);
  }

  private transaction(action: () => void): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      action();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}
