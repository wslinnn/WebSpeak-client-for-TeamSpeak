import {
  Client as TeamSpeakClient,
  generateIdentity,
  type ClientOptions,
  type Identity,
} from "@echosixhiya/teamspeak-client";
import { WebSpeakTeamSpeakResolver } from "./teamspeak-resolver.js";
import type { Logger } from "../logger.js";
import { normalizeTeamSpeakError } from "../errors.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey, type TeamSpeakProtocol, type TeamSpeakTarget } from "../domain/teamspeak-target.js";

export type { TeamSpeakProtocol };

interface CacheEntry {
  protocol: TeamSpeakProtocol;
  lastSuccessfulAt: number;
}

/** Process-local optimization; protocol is never persisted as user config. */
export class EndpointProtocolCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs = 30 * 60 * 1000,
    private readonly maxEntries = 128,
  ) {}

  get(target: TeamSpeakTarget, now = Date.now()): TeamSpeakProtocol | undefined {
    const key = teamSpeakTargetKey(target);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (now - entry.lastSuccessfulAt > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.protocol;
  }

  set(target: TeamSpeakTarget, protocol: TeamSpeakProtocol, now = Date.now()): void {
    const key = teamSpeakTargetKey(target);
    this.entries.delete(key);
    this.entries.set(key, { protocol, lastSuccessfulAt: now });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

export const endpointProtocolCache = new EndpointProtocolCache();

const TEAM_SPEAK_CONNECT_TIMEOUT_MS = 15_000;

export interface TeamSpeakAdapterOptions {
  target: TeamSpeakTarget;
  nickname: string;
  identity?: Identity;
  serverPassword?: string;
  defaultChannel?: string;
  channelPassword?: string;
}

/**
 * The SDK performs the wire-level TS3/TS6 negotiation itself. This adapter is
 * the only application boundary that knows about that SDK and records the
 * successfully observed server generation for later connections.
 */
export class TeamSpeakAdapter {
  readonly client: TeamSpeakClient;
  readonly identity: Identity;
  private detectedProtocol: TeamSpeakProtocol | null = null;

  constructor(
    options: TeamSpeakAdapterOptions,
    private readonly logger: Logger,
    private readonly protocolCache: EndpointProtocolCache = endpointProtocolCache,
  ) {
    this.identity = options.identity ?? generateIdentity(8);
    // SDK debug output is raw protocol chatter that can embed credentials and
    // arrives at voice-message rate. It stays off unless explicitly requested
    // with WEBSPEAK_SDK_DEBUG=1; info/warn/error always pass through.
    const sdkDebugEnabled = process.env.WEBSPEAK_SDK_DEBUG?.trim() === "1";
    const clientOptions: ClientOptions = {
      resolver: new WebSpeakTeamSpeakResolver(),
      serverPassword: options.serverPassword,
      defaultChannel: options.defaultChannel,
      defaultChannelPassword: options.channelPassword,
      logger: {
        debug: (msg: string) => { if (sdkDebugEnabled) this.logger.debug(msg); },
        info: (msg: string) => this.logger.info(msg),
        warn: (msg: string) => this.logger.warn(msg),
        error: (msg: string) => this.logger.error(msg),
      },
    };
    this.client = new TeamSpeakClient(
      this.identity,
      formatTeamSpeakTarget(options.target),
      options.nickname,
      clientOptions,
    );
    this.target = options.target;
  }

  private readonly target: TeamSpeakTarget;

  async connect(): Promise<void> {
    const cachedProtocol = this.protocolCache.get(this.target);
    this.logger.info({ target: formatTeamSpeakTarget(this.target), cachedProtocol }, "Connecting through TeamSpeak adapter");
    try {
      await this.client.connect();
      await this.client.waitConnected(AbortSignal.timeout(TEAM_SPEAK_CONNECT_TIMEOUT_MS));
    } catch (error: unknown) {
      await this.client.disconnect().catch(() => undefined);
      throw normalizeTeamSpeakError(error);
    }

    const observedProtocol = await this.detectProtocol();
    this.detectedProtocol = observedProtocol ?? cachedProtocol ?? null;
    if (observedProtocol) this.protocolCache.set(this.target, observedProtocol);
  }

  get protocol(): TeamSpeakProtocol | null {
    return this.detectedProtocol;
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
    } catch {
      // Teardown must remain safe when the transport has already gone away.
    }
  }

  private async detectProtocol(): Promise<TeamSpeakProtocol | null> {
    try {
      const rows = await this.client.execCommandWithResponse("version", 3000);
      // Prefer the field the protocol names: the detector reads only the leading
      // version, so a server that reports its fields in another order would
      // otherwise lose detection even though the value is right there.
      const reported = rows
        .map((row) => row.version)
        .find((value): value is string => typeof value === "string" && value.trim().length > 0);
      const versionText = reported
        ?? rows.flatMap((row) => Object.values(row)).filter((value): value is string => typeof value === "string").join(" ");
      return detectTeamSpeakProtocol(versionText);
    } catch {
      // Version discovery is an optimization; connection success is enough to proceed.
      return null;
    }
  }
}

export function detectTeamSpeakProtocol(versionText: string): TeamSpeakProtocol | null {
  const text = versionText.trim().toLowerCase();
  // `version` 响应以服务器版本号开头（前面可能带产品名）。只认开头的主版本号：
  // 扫全串会把 TeamSpeak 3.6.7 里的「6.」误判成 TeamSpeak 6（3.6.x 服务器被
  // 当成 TS6 后，屏幕共享与流命令会走错协议路径）。
  const match = /^(?:teamspeak\s*)?(\d+)/.exec(text);
  if (!match) return null;
  const major = Number(match[1]);
  if (major === 6) return "ts6";
  if (major === 3) return "ts3";
  return null;
}
