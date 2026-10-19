import { copyFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

/** Schema version this build ships; the migration waterfall brings any older
 *  database up to it. database.ts re-exports it as the public face. */
export const DATABASE_SCHEMA_VERSION = 12;

/** The v1→v12 migration waterfall. Each step upgrades one schema version and
 *  re-runs on the next until the database reaches DATABASE_SCHEMA_VERSION;
 *  fresh installs fall through every block. Historical blocks still create
 *  since-removed tables so older databases and fresh installs take the same
 *  waterfall path. */
export function runSchemaMigrations(
  database: DatabaseSync,
  path: string,
  transaction: (action: () => void) => void,
): void {
  let version = Number((database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (version > DATABASE_SCHEMA_VERSION) {
    throw new Error(`Database schema ${version} is newer than this WebSpeak build`);
  }
  if (version === 0) {
    transaction(() => {
      database.exec(`
        CREATE TABLE metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE admin_credentials (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          credential_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          site_name TEXT NOT NULL,
          welcome_text TEXT NOT NULL,
          access_mode TEXT NOT NULL CHECK (access_mode IN ('fixed', 'open')),
          ts_host TEXT NOT NULL,
          ts_port INTEGER NOT NULL CHECK (ts_port BETWEEN 1 AND 65535),
          ts_password_encrypted TEXT,
          detected_protocol TEXT CHECK (detected_protocol IS NULL OR detected_protocol IN ('ts3', 'ts6')),
          last_test_at TEXT,
          last_test_latency_ms INTEGER,
          last_test_error TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE audit_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event TEXT NOT NULL,
          details_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      const now = new Date().toISOString();
      database.prepare(
        `INSERT INTO settings (
           id, site_name, welcome_text, access_mode, ts_host, ts_port,
           ts_password_encrypted, detected_protocol, last_test_at,
           last_test_latency_ms, last_test_error, updated_at
         ) VALUES (1, 'WebSpeak', '', 'fixed', '127.0.0.1', 9987, NULL, NULL, NULL, NULL, NULL, ?)`,
      ).run(now);
      database.exec("PRAGMA user_version = 1");
    });
    version = 1;
  }
  if (version === 1) {
    transaction(() => {
      database.exec(`
        CREATE TABLE managed_invites (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          target_host TEXT NOT NULL,
          target_port INTEGER NOT NULL CHECK (target_port BETWEEN 1 AND 65535),
          server_password_encrypted TEXT,
          channel TEXT NOT NULL DEFAULT '',
          expires_at TEXT NOT NULL,
          max_uses INTEGER NOT NULL CHECK (max_uses >= 0),
          use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
          created_at TEXT NOT NULL,
          revoked_at TEXT
        );
        CREATE INDEX managed_invites_token_idx ON managed_invites(token_hash);
        CREATE INDEX managed_invites_expiry_idx ON managed_invites(expires_at);
      `);
      database.exec("PRAGMA user_version = 2");
    });
    version = 2;
  }
  if (version === 2) {
    transaction(() => {
      database.exec(`
        -- WebRTC media ports are stored with the administrator settings so the
        -- same range is used by the gateway and shown in the admin console.
        ALTER TABLE settings ADD COLUMN webrtc_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_enabled IN (0, 1));
        ALTER TABLE settings ADD COLUMN webrtc_public_host TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings ADD COLUMN webrtc_udp_start INTEGER NOT NULL DEFAULT 40000 CHECK (webrtc_udp_start BETWEEN 1 AND 65535);
        ALTER TABLE settings ADD COLUMN webrtc_udp_end INTEGER NOT NULL DEFAULT 41999 CHECK (webrtc_udp_end BETWEEN 1 AND 65535);
      `);
      database.exec("PRAGMA user_version = 3");
    });
    version = 3;
  }
  if (version === 3) {
    transaction(() => {
      database.exec(`
        ALTER TABLE settings ADD COLUMN welcome_text_en TEXT NOT NULL DEFAULT '';
      `);
      database.exec("PRAGMA user_version = 4");
    });
    version = 4;
  }
  if (version === 4) {
    transaction(() => {
      database.exec(`
        ALTER TABLE settings ADD COLUMN relay_configured INTEGER NOT NULL DEFAULT 0 CHECK (relay_configured IN (0, 1));
        ALTER TABLE settings ADD COLUMN relay_enabled INTEGER NOT NULL DEFAULT 0 CHECK (relay_enabled IN (0, 1));
        ALTER TABLE settings ADD COLUMN relay_name TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings ADD COLUMN relay_host TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings ADD COLUMN relay_port INTEGER NOT NULL DEFAULT 39087 CHECK (relay_port BETWEEN 1 AND 65535);
        ALTER TABLE settings ADD COLUMN relay_token_encrypted TEXT;
      `);
      database.exec("PRAGMA user_version = 5");
    });
    version = 5;
  }
  if (version === 5) {
    transaction(() => {
      database.exec(`
        CREATE TABLE relay_nodes (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
          host TEXT NOT NULL,
          port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
          token_encrypted TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX relay_nodes_enabled_idx ON relay_nodes(enabled);
      `);
      const legacy = database.prepare(
        `SELECT relay_configured, relay_enabled, relay_name, relay_host, relay_port, relay_token_encrypted
         FROM settings WHERE id = 1`,
      ).get() as {
        relay_configured?: number;
        relay_enabled?: number;
        relay_name?: string;
        relay_host?: string;
        relay_port?: number;
        relay_token_encrypted?: string | null;
      } | undefined;
      if (legacy?.relay_configured === 1 && legacy.relay_host && legacy.relay_token_encrypted) {
        const now = new Date().toISOString();
        database.prepare(
          `INSERT INTO relay_nodes (id, name, enabled, host, port, token_encrypted, created_at, updated_at)
           VALUES ('relay-default', ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          legacy.relay_name || "中继加速",
          legacy.relay_enabled === 1 ? 1 : 0,
          legacy.relay_host,
          legacy.relay_port || 39087,
          legacy.relay_token_encrypted,
          now,
          now,
        );
      }
      database.exec("PRAGMA user_version = 6");
    });
    version = 6;
  }
  if (version === 6) {
    transaction(() => {
      database.exec(`
        ALTER TABLE settings ADD COLUMN welcome_text_de TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings ADD COLUMN welcome_text_ru TEXT NOT NULL DEFAULT '';
        ALTER TABLE settings ADD COLUMN welcome_text_ja TEXT NOT NULL DEFAULT '';
      `);
      database.exec("PRAGMA user_version = 7");
    });
    version = 7;
  }
  if (version === 7) {
    transaction(() => {
      database.exec(`
        ALTER TABLE settings ADD COLUMN webrtc_ipv6_enabled INTEGER NOT NULL DEFAULT 0 CHECK (webrtc_ipv6_enabled IN (0, 1));
        ALTER TABLE settings ADD COLUMN webrtc_stun_server TEXT NOT NULL DEFAULT '';
      `);
      database.exec("PRAGMA user_version = 8");
    });
    version = 8;
  }
  if (version === 8) {
    transaction(() => {
      database.exec(`
        ALTER TABLE settings ADD COLUMN ts_target TEXT;
        ALTER TABLE managed_invites ADD COLUMN target_text TEXT;
      `);
      database.exec("PRAGMA user_version = 9");
    });
    version = 9;
  }
  // The acceleration relay feature was removed. Columns are dropped only
  // when present so databases migrated by older schemas and fresh installs
  // take the same path.
  if (version === 9) {
    transaction(() => {
      database.exec("DROP TABLE IF EXISTS relay_nodes");
      const columns = (database.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>).map((column) => column.name);
      for (const column of ["relay_configured", "relay_enabled", "relay_name", "relay_host", "relay_port", "relay_token_encrypted"]) {
        if (columns.includes(column)) database.exec(`ALTER TABLE settings DROP COLUMN ${column}`);
      }
      database.exec("DELETE FROM metadata WHERE key = 'visitor_count'");
      database.exec("PRAGMA user_version = 10");
    });
    version = 10;
  }
  // WebRTC is this fork's primary voice path. The opt-in column defaults to
  // off for upgrade compatibility; this one-time migration promotes it so a
  // deployment does not silently stay on the compatibility transport. An
  // administrator who disables it afterwards keeps that choice.
  if (version === 10) {
    transaction(() => {
      database.exec("UPDATE settings SET webrtc_enabled = 1 WHERE id = 1 AND webrtc_enabled = 0");
      database.exec("PRAGMA user_version = 11");
    });
    version = 11;
  }
  // The managed-invite feature was removed: a revocable link on a server
  // that anyone with the site URL can join unlocks nothing, so the table is
  // dropped. Historical migration blocks above still create it so older
  // databases and fresh installs take the same waterfall path.
  if (version === 11) {
    transaction(() => {
      database.exec("DROP TABLE IF EXISTS managed_invites");
      database.exec("PRAGMA user_version = 12");
    });
    version = 12;
  }
}

/** Migrate-time schema backup: a pre-migration snapshot lands next to the
 *  database so a failed upgrade is recoverable by hand. */
export function backupPreMigrationSchema(path: string, version: number): void {
  copyFileSync(path, `${path}.schema-${version}.bak`);
}
