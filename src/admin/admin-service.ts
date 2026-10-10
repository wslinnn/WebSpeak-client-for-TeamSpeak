import type { AdminSettingsInput, ManagedInviteInput } from "../shared/admin-inputs.js";
export type { AdminSettingsInput, ManagedInviteInput } from "../shared/admin-inputs.js";
import type { AdminOverview, AdminSettings } from "../shared/admin-responses.js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import type { Logger } from "../logger.js";
import { loadConfig } from "../config.js";
import { DEFAULT_TEAM_SPEAK_PORT, formatTeamSpeakTarget, type TeamSpeakTarget } from "../domain/teamspeak-target.js";
import { formatTeamSpeakConnectionTarget, parseTeamSpeakConnectionTarget, type TeamSpeakConnectionTarget } from "../domain/teamspeak-connection-target.js";
import { resolveTeamSpeakTarget, TeamSpeakAliasLookupError } from "../server/teamspeak-alias.js";
import { type AccessMode, type ManagedInviteRecord, type SettingsUpdate, WebSpeakDatabase } from "../persistence/database.js";
import { hashAdminPassword, validateAdminPassword, verifyAdminPassword } from "../security/admin-password.js";
import { decryptSecret, encryptSecret } from "../security/secret-crypto.js";
import { probeTeamSpeak, TeamSpeakProbeError } from "../server/teamspeak-probe.js";
import { pingTeamSpeakHost } from "../server/network-probe.js";
import { normalizeVoiceMediaHost, normalizeVoiceStunServer } from "../shared/voice-ice.js";
import type { WebRtcAudioOptions } from "../server/webrtc-audio.js";
import { DEFAULT_WEBRTC_UDP_PORT_RANGE, WEBRTC_UDP_PORT_MAX, WEBRTC_UDP_PORT_MIN } from "../server/webrtc-config.js";
import { DEFAULT_WELCOME_TEXTS, resolveWelcomeTexts } from "../site-copy.js";

export interface ConnectionPolicy {
  defaultTarget: string;
  serverPassword: string;
  accessMode: AccessMode;
}

export interface ManagedInviteView {
  id: string;
  target: string;
  channel: string;
  expiresAt: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  revokedAt: string | null;
  status: "active" | "expired" | "exhausted" | "revoked";
}

type ProbeFunction = typeof probeTeamSpeak;

export class AdminService {
  constructor(
    readonly database: WebSpeakDatabase,
    private readonly masterSecret: Buffer,
    private readonly logger: Logger,
    private readonly legacyConfigPath: string,
    private readonly probe: ProbeFunction = probeTeamSpeak,
    private readonly version = "0.1.0",
  ) {}

  async initialize(): Promise<void> {
    this.importLegacyConfigOnce();
    if (!this.database.hasAdmin()) {
      // First start has no owner yet. A random setup token printed to the log
      // replaces the historical admin/admin default: a public deployment then
      // has no guessable takeover window, and the token is only accepted for
      // the login + change-password pair until a real password is set.
      const setupToken = `ws-setup-${randomBytes(18).toString("base64url")}`;
      const credential = await hashAdminPassword(setupToken, { username: "admin", mustChangePassword: true, allowWeakPassword: true });
      this.database.initializeAdmin(credential, this.toSettingsUpdate(this.database.getSettings()));
      this.logger.warn("No administrator password has been set yet. Sign in with the one-time setup token printed below, then set a real password; the token stops working afterwards.");
      this.logger.warn(`Admin setup token: ${setupToken}`);
    }
  }

  isInitialized(): boolean {
    return this.database.hasAdmin();
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    const credential = this.database.getAdminCredential();
    return credential?.username === username && await verifyAdminPassword(password, credential);
  }

  isPasswordChangeRequired(): boolean {
    return this.database.getAdminCredential()?.mustChangePassword === true;
  }

  async changePassword(password: string): Promise<void> {
    const credential = this.database.getAdminCredential();
    if (!credential) throw new AdminInputError("NOT_INITIALIZED", "The administrator account is not initialized");
    const passwordError = validateAdminPassword(password);
    if (passwordError) throw new AdminInputError("INVALID_ADMIN_PASSWORD", passwordError);
    const replacement = await hashAdminPassword(password, { username: credential.username, mustChangePassword: false });
    this.database.updateAdminCredential(replacement);
    this.database.addAudit("ADMIN_PASSWORD_CHANGED");
  }

  getPublicConfig(): Record<string, unknown> {
    const settings = this.database.getSettings();
    const welcomeTexts = resolveWelcomeTexts({
      zh: settings.welcomeText,
      en: settings.welcomeTextEn,
      de: settings.welcomeTextDe,
      ru: settings.welcomeTextRu,
      ja: settings.welcomeTextJa,
    });
    return {
      version: this.version,
      initialized: this.isInitialized(),
      siteName: settings.siteName,
      // Keep the old fields for older clients, but return the complete,
      // already-fallback-resolved map for current clients.
      welcomeText: welcomeTexts.zh,
      welcomeTextEn: welcomeTexts.en,
      welcomeTexts,
      accessMode: settings.accessMode,
      // In fixed mode the target is administrator-controlled; handing the real
      // address to every visitor would let them bypass the gateway and connect
      // directly, so it only ships in open mode where the user picks a target.
      target: settings.accessMode === "open" ? settingsTarget(settings) : "",
    };
  }

  getAdminSettings(): AdminSettings {
    const settings = this.database.getSettings();
    return {
      target: settingsTarget(settings),
      hasPassword: Boolean(settings.tsPasswordEncrypted),
      accessMode: settings.accessMode,
      siteName: settings.siteName,
      welcomeText: settings.welcomeText,
      welcomeTextEn: settings.welcomeTextEn,
      welcomeTextDe: settings.welcomeTextDe,
      welcomeTextRu: settings.welcomeTextRu,
      welcomeTextJa: settings.welcomeTextJa,
      welcomeDefaults: DEFAULT_WELCOME_TEXTS,
      lastTestAt: settings.lastTestAt,
      lastTestLatencyMs: settings.lastTestLatencyMs,
      lastTestError: settings.lastTestError,
      webRtcEnabled: settings.webRtcEnabled,
      webRtcPublicHost: settings.webRtcPublicHost,
      webRtcIpv6Enabled: settings.webRtcIpv6Enabled,
      webRtcStunServer: settings.webRtcStunServer,
      webRtcUdpStart: settings.webRtcUdpStart,
      webRtcUdpEnd: settings.webRtcUdpEnd,
      internalPort: 3040,
      updatedAt: settings.updatedAt,
    };
  }

  getWebRtcAudioOptions(): WebRtcAudioOptions {
    const settings = this.database.getSettings();
    return {
      enabled: settings.webRtcEnabled,
      publicHost: settings.webRtcPublicHost,
      ipv6Enabled: settings.webRtcIpv6Enabled,
      stunServer: settings.webRtcStunServer,
      udpPortRange: [settings.webRtcUdpStart, settings.webRtcUdpEnd],
    };
  }

  updateSettings(input: AdminSettingsInput): void {
    const current = this.database.getSettings();
    const settings = this.normalizeSettings(input, current);
    const targetChanged = current.tsHost !== settings.tsHost || current.tsPort !== settings.tsPort || current.tsTarget !== settings.tsTarget;
    this.database.updateSettings(settings);
    if (targetChanged) this.database.clearConnectionTest();
  }

  getConnectionPolicy(): ConnectionPolicy {
    const settings = this.database.getSettings();
    let serverPassword = "";
    try {
      serverPassword = decryptSecret(settings.tsPasswordEncrypted, this.masterSecret);
    } catch (error: unknown) {
      this.logger.error({ err: error instanceof Error ? error.message : String(error) }, "Stored TeamSpeak password could not be decrypted");
    }
    return {
      defaultTarget: settingsTarget(settings),
      serverPassword,
      accessMode: settings.accessMode,
    };
  }

  async testConnection(targetText: string, password: string, persistResult: boolean): Promise<{ ok: boolean; checkType: "network" | "protocol"; passwordVerified: boolean; latencyMs: number; serverName: string | null; requiresPassword: boolean; packetLossPercent?: number; attempts?: number; successfulAttempts?: number; errorCode?: string }> {
    let target: TeamSpeakTarget;
    try {
      parseTeamSpeakConnectionTarget(targetText);
    } catch {
      throw new AdminInputError("INVALID_TARGET", "TeamSpeak target is invalid");
    }
    try {
      target = await resolveTeamSpeakTarget(targetText);
      // The admin connection test must not create a temporary TeamSpeak
      // client: that client becomes visible in the target channel. Use the
      // WebSpeak host's ICMP route measurement instead. The injected probe is
      // retained for unit tests and explicit protocol-probe callers.
      if (this.probe === probeTeamSpeak) {
        const result = await pingTeamSpeakHost(target.host, { attempts: 4 });
        const publicResult = {
          ok: result.ok,
          checkType: "network" as const,
          passwordVerified: false,
          latencyMs: result.latencyMs ?? 0,
          serverName: null,
          requiresPassword: false,
          packetLossPercent: result.packetLossPercent,
          attempts: result.attempts,
          successfulAttempts: result.successfulAttempts,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
        };
        if (persistResult) {
          this.database.recordConnectionTest({ protocol: null, latencyMs: result.latencyMs, error: result.ok ? null : (result.errorCode ?? "UNREACHABLE") });
          this.database.addAudit(result.ok ? "CONNECTION_TEST_SUCCEEDED" : "CONNECTION_TEST_FAILED", {
            latencyMs: result.latencyMs,
            packetLossPercent: result.packetLossPercent,
            ...(result.errorCode ? { code: result.errorCode } : {}),
          });
        }
        return publicResult;
      }
      const result = await this.probe(target, password, this.logger);
      if (persistResult) {
        this.database.recordConnectionTest({ protocol: result.protocol, latencyMs: result.latencyMs, error: null });
        this.database.addAudit("CONNECTION_TEST_SUCCEEDED", { protocol: result.protocol, latencyMs: result.latencyMs });
      }
      const { protocol: _protocol, ...publicResult } = result;
      return { ...publicResult, checkType: "protocol", passwordVerified: true };
    } catch (error: unknown) {
      const probeError = error instanceof TeamSpeakProbeError
        ? error
        : error instanceof TeamSpeakAliasLookupError
          ? new TeamSpeakProbeError("HOST_NOT_FOUND", "TeamSpeak server nickname could not be resolved", error)
          : new TeamSpeakProbeError("INTERNAL_ERROR", "Connection test failed", error);
      if (persistResult) {
        this.database.recordConnectionTest({ protocol: null, latencyMs: null, error: probeError.code });
        this.database.addAudit("CONNECTION_TEST_FAILED", { code: probeError.code });
      }
      throw probeError;
    }
  }

  getOverview(activeSessions: number, peakSessions: number, startedAt: number): AdminOverview {
    const settings = this.database.getSettings();
    return {
      gateway: {
        status: "running",
        version: this.version,
        uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      },
      teamSpeak: {
        target: settingsTarget(settings),
        status: settings.lastTestError ? "unreachable" : settings.lastTestAt ? "reachable" : "unknown",
        lastTestAt: settings.lastTestAt,
        latencyMs: settings.lastTestLatencyMs,
        lastError: settings.lastTestError,
      },
      sessions: { active: activeSessions, peak: peakSessions, limit: 100 },
      recentEvents: this.database.recentAudit(),
      legacyConfigImported: this.database.getMeta("legacy_import_notice_pending") === "1",
    };
  }

  createManagedInvite(input: ManagedInviteInput): { invite: ManagedInviteView; token: string } {
    const channel = input.channel.trim();
    if (channel.length > 100) throw new AdminInputError("INVALID_INVITE_CHANNEL", "Invite channel cannot exceed 100 characters");
    if (!Number.isFinite(input.expiresInHours) || input.expiresInHours < 1 || input.expiresInHours > 720) {
      throw new AdminInputError("INVALID_INVITE_EXPIRY", "Invite expiry must be between 1 and 720 hours");
    }
    if (!Number.isInteger(input.maxUses) || input.maxUses < 0 || input.maxUses > 10000) {
      throw new AdminInputError("INVALID_INVITE_USES", "Invite max uses must be between 0 and 10000");
    }
    const settings = this.database.getSettings();
    const token = randomBytes(32).toString("base64url");
    const record = this.database.createManagedInvite({
      id: `invite-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
      tokenHash: hashInviteToken(token),
      targetHost: settings.tsHost,
      targetPort: settings.tsPort,
      targetText: settings.tsTarget,
      serverPasswordEncrypted: settings.tsPasswordEncrypted,
      channel,
      expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000).toISOString(),
      maxUses: input.maxUses,
    });
    this.database.addAudit("INVITE_CREATED", { id: record.id, channel, maxUses: input.maxUses });
    return { invite: this.toInviteView(record), token };
  }

  listManagedInvites(): ManagedInviteView[] {
    return this.database.listManagedInvites().map((record) => this.toInviteView(record));
  }

  revokeManagedInvite(id: string): boolean {
    if (!/^invite-[a-z0-9-]+$/i.test(id) || id.length > 100) throw new AdminInputError("INVALID_INVITE_ID", "Invite id is invalid");
    const revoked = this.database.revokeManagedInvite(id);
    if (revoked) this.database.addAudit("INVITE_REVOKED", { id });
    return revoked;
  }

  getManagedInvite(token: string): { target: string; channel: string } | null {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
    const record = this.database.getManagedInvite(hashInviteToken(token));
    if (!record) return null;
    return {
      target: record.targetText ?? formatTeamSpeakTarget({ host: record.targetHost, port: record.targetPort }),
      channel: record.channel,
    };
  }

  consumeManagedInvite(token: string): { target: string; serverPassword: string; channel: string } | null {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
    const record = this.database.consumeManagedInvite(hashInviteToken(token));
    if (!record) return null;
    // Invites carry the admin's CURRENT TeamSpeak password, not a snapshot
    // taken at creation: rotating the settings password must not strand
    // outstanding invites with a stale credential.
    let serverPassword = "";
    try {
      serverPassword = decryptSecret(this.database.getSettings().tsPasswordEncrypted, this.masterSecret);
    } catch (error: unknown) {
      this.logger.error({ err: error instanceof Error ? error.message : String(error), inviteId: record.id }, "Managed invite password could not be decrypted");
    }
    this.database.addAudit("INVITE_CONSUMED", { id: record.id });
    return { target: record.targetText ?? formatTeamSpeakTarget({ host: record.targetHost, port: record.targetPort }), serverPassword, channel: record.channel };
  }

  dismissLegacyImportNotice(): void {
    this.database.setMeta("legacy_import_notice_pending", "0");
  }

  private normalizeSettings(input: AdminSettingsInput, current: ReturnType<WebSpeakDatabase["getSettings"]>): SettingsUpdate {
    let target: TeamSpeakConnectionTarget;
    try {
      target = parseTeamSpeakConnectionTarget(input.target);
    } catch {
      throw new AdminInputError("INVALID_TARGET", "TeamSpeak target is invalid");
    }
    const siteName = input.siteName.trim();
    const welcomeText = input.welcomeText.trim();
    const welcomeTextEn = typeof input.welcomeTextEn === "string" ? input.welcomeTextEn.trim() : current.welcomeTextEn;
    const welcomeTextDe = typeof input.welcomeTextDe === "string" ? input.welcomeTextDe.trim() : current.welcomeTextDe;
    const welcomeTextRu = typeof input.welcomeTextRu === "string" ? input.welcomeTextRu.trim() : current.welcomeTextRu;
    const welcomeTextJa = typeof input.welcomeTextJa === "string" ? input.welcomeTextJa.trim() : current.welcomeTextJa;
    if (!siteName || siteName.length > 80) throw new AdminInputError("INVALID_SITE_NAME", "Site name must contain 1 to 80 characters");
    if (welcomeText.length > 500) throw new AdminInputError("INVALID_WELCOME_TEXT", "Welcome text cannot exceed 500 characters");
    if (welcomeTextEn.length > 500) throw new AdminInputError("INVALID_WELCOME_TEXT_EN", "English welcome text cannot exceed 500 characters");
    if (welcomeTextDe.length > 500) throw new AdminInputError("INVALID_WELCOME_TEXT_DE", "German welcome text cannot exceed 500 characters");
    if (welcomeTextRu.length > 500) throw new AdminInputError("INVALID_WELCOME_TEXT_RU", "Russian welcome text cannot exceed 500 characters");
    if (welcomeTextJa.length > 500) throw new AdminInputError("INVALID_WELCOME_TEXT_JA", "Japanese welcome text cannot exceed 500 characters");
    if (input.accessMode !== "fixed" && input.accessMode !== "open") {
      throw new AdminInputError("INVALID_ACCESS_MODE", "Access mode is invalid");
    }
    if (typeof input.webRtcEnabled !== "boolean") {
      throw new AdminInputError("INVALID_WEBRTC_ENABLED", "WebRTC enabled value is invalid");
    }
    const webRtcPublicHost = normalizeVoiceMediaHost(input.webRtcPublicHost === undefined ? current.webRtcPublicHost : input.webRtcPublicHost);
    const webRtcStunServer = normalizeVoiceStunServer(input.webRtcStunServer === undefined ? current.webRtcStunServer : input.webRtcStunServer);
    const webRtcIpv6Enabled = input.webRtcIpv6Enabled === undefined ? current.webRtcIpv6Enabled : input.webRtcIpv6Enabled;
    if (webRtcPublicHost === null) throw new AdminInputError("INVALID_WEBRTC_PUBLIC_HOST", "Use an IP address or hostname without a scheme, path or port");
    if (webRtcStunServer === null) throw new AdminInputError("INVALID_WEBRTC_STUN_SERVER", "Use a UDP STUN URL: stun:host:port");
    if (typeof webRtcIpv6Enabled !== "boolean") throw new AdminInputError("INVALID_WEBRTC_IPV6", "WebRTC IPv6 value must be boolean");
    const webRtcUdpStart = input.webRtcUdpStart ?? current.webRtcUdpStart ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[0];
    const webRtcUdpEnd = input.webRtcUdpEnd ?? current.webRtcUdpEnd ?? DEFAULT_WEBRTC_UDP_PORT_RANGE[1];
    if (!Number.isInteger(webRtcUdpStart) || webRtcUdpStart < WEBRTC_UDP_PORT_MIN || webRtcUdpStart > WEBRTC_UDP_PORT_MAX) {
      throw new AdminInputError("INVALID_WEBRTC_PORT_RANGE", "WebRTC UDP start port must be between 1024 and 65535");
    }
    if (!Number.isInteger(webRtcUdpEnd) || webRtcUdpEnd < WEBRTC_UDP_PORT_MIN || webRtcUdpEnd > WEBRTC_UDP_PORT_MAX) {
      throw new AdminInputError("INVALID_WEBRTC_PORT_RANGE", "WebRTC UDP end port must be between 1024 and 65535");
    }
    if (webRtcUdpStart > webRtcUdpEnd) {
      throw new AdminInputError("INVALID_WEBRTC_PORT_RANGE", "WebRTC UDP start port must not exceed the end port");
    }
    if (current.webRtcEnabled && (webRtcUdpStart !== current.webRtcUdpStart || webRtcUdpEnd !== current.webRtcUdpEnd)) {
      throw new AdminInputError("WEBRTC_PORT_LOCKED", "Disable WebRTC and save before changing its UDP port range");
    }

    let encryptedPassword = current.tsPasswordEncrypted;
    const action = input.passwordAction ?? (input.serverPassword === undefined ? "keep" : "replace");
    if (action === "remove") encryptedPassword = null;
    if (action === "replace") encryptedPassword = input.serverPassword ? encryptSecret(input.serverPassword, this.masterSecret) : null;

    return {
      siteName,
      welcomeText,
      welcomeTextEn,
      welcomeTextDe,
      welcomeTextRu,
      welcomeTextJa,
      accessMode: input.accessMode,
      tsHost: target.kind === "nickname" ? target.name : target.target.host,
      tsPort: target.kind === "nickname" ? target.port ?? DEFAULT_TEAM_SPEAK_PORT : target.target.port,
      tsTarget: target.kind === "nickname" ? formatTeamSpeakConnectionTarget(target) : null,
      tsPasswordEncrypted: encryptedPassword,
      webRtcEnabled: input.webRtcEnabled,
      webRtcPublicHost, webRtcIpv6Enabled, webRtcStunServer,
      webRtcUdpStart,
      webRtcUdpEnd,
    };
  }

  private toInviteView(record: ManagedInviteRecord): ManagedInviteView {
    const now = Date.now();
    const expired = Date.parse(record.expiresAt) <= now;
    const exhausted = record.maxUses > 0 && record.useCount >= record.maxUses;
    return {
      id: record.id,
      target: record.targetText ?? formatTeamSpeakTarget({ host: record.targetHost, port: record.targetPort }),
      channel: record.channel,
      expiresAt: record.expiresAt,
      maxUses: record.maxUses,
      useCount: record.useCount,
      createdAt: record.createdAt,
      revokedAt: record.revokedAt,
      status: record.revokedAt ? "revoked" : expired ? "expired" : exhausted ? "exhausted" : "active",
    };
  }

  private toSettingsUpdate(settings: ReturnType<WebSpeakDatabase["getSettings"]>): SettingsUpdate {
    return {
      siteName: settings.siteName,
      welcomeText: settings.welcomeText,
      welcomeTextEn: settings.welcomeTextEn,
      welcomeTextDe: settings.welcomeTextDe,
      welcomeTextRu: settings.welcomeTextRu,
      welcomeTextJa: settings.welcomeTextJa,
      accessMode: settings.accessMode,
      tsHost: settings.tsHost,
      tsPort: settings.tsPort,
      tsTarget: settings.tsTarget,
      tsPasswordEncrypted: settings.tsPasswordEncrypted,
      webRtcEnabled: settings.webRtcEnabled,
      webRtcPublicHost: settings.webRtcPublicHost,
      webRtcIpv6Enabled: settings.webRtcIpv6Enabled,
      webRtcStunServer: settings.webRtcStunServer,
      webRtcUdpStart: settings.webRtcUdpStart,
      webRtcUdpEnd: settings.webRtcUdpEnd,
    };
  }

  private importLegacyConfigOnce(): void {
    if (this.database.getMeta("legacy_config_checked") === "1") return;
    if (existsSync(this.legacyConfigPath)) {
      const legacy = loadConfig(this.legacyConfigPath);
      const current = this.database.getSettings();
      this.database.updateSettings({
        siteName: current.siteName,
        welcomeText: current.welcomeText,
        welcomeTextEn: current.welcomeTextEn,
        welcomeTextDe: current.welcomeTextDe,
        welcomeTextRu: current.welcomeTextRu,
        welcomeTextJa: current.welcomeTextJa,
        accessMode: current.accessMode,
        tsHost: legacy.tsHost,
        tsPort: legacy.tsPort,
        tsTarget: legacy.tsTarget ?? null,
        tsPasswordEncrypted: legacy.tsServerPassword ? encryptSecret(legacy.tsServerPassword, this.masterSecret) : null,
        webRtcEnabled: current.webRtcEnabled,
        webRtcPublicHost: current.webRtcPublicHost,
        webRtcIpv6Enabled: current.webRtcIpv6Enabled,
        webRtcStunServer: current.webRtcStunServer,
        webRtcUdpStart: current.webRtcUdpStart,
        webRtcUdpEnd: current.webRtcUdpEnd,
      }, "LEGACY_CONFIG_IMPORTED");
      this.database.setMeta("legacy_config_imported", "1");
      this.database.setMeta("legacy_import_notice_pending", "1");
      this.logger.info("Legacy config imported; WebSpeak settings are now managed from /admin");
    }
    this.database.setMeta("legacy_config_checked", "1");
  }
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function settingsTarget(settings: { tsHost: string; tsPort: number; tsTarget?: string | null }): string {
  return settings.tsTarget ?? formatTeamSpeakTarget({ host: settings.tsHost, port: settings.tsPort });
}

export class AdminInputError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AdminInputError";
  }
}
