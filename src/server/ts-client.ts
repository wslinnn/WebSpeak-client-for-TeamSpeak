import { EventEmitter } from "node:events";
import { asChannelID, asClientID, moveClient, pokeClient, sendChannelMessage, sendPrivateMessage, sendServerMessage, type ClientEnterEvent, type ClientLeaveEvent, type ClientMovedEvent, type ClientUpdatedEvent, type Codec, type DisconnectedEvent, type KickedEvent, type NotificationEvent, type PokeEvent, type TextMessageEvent, type VoiceDataEvent } from "@honeybbq/teamspeak";
import { Client as TSFullClient, generateIdentitySync, subscribeAllChannels, type Identity } from "@honeybbq/teamspeak/client";
import type { Logger } from "../logger.js";
import { describeTeamSpeakError, normalizeTeamSpeakError, normalizeTeamSpeakKickedReason } from "../errors.js";
import { escapeTeamSpeakValue } from "../security/ts-escaping.js";
import { TeamSpeakAdapter, type TeamSpeakProtocol } from "./teamspeak-adapter.js";
import type { TeamSpeakTarget } from "../domain/teamspeak-target.js";
import { toTSChatMessage, tsListChannelsFull, tsListClientsFull, type TSChannelListing } from "./ts-client-protocol.js";
import { ChannelTreeStore, toDirectoryClientChanges, toTSDirectoryClient } from "./ts-client-directory.js";
import { applyChannelPasswordFlagNotification } from "./channel-flags.js";
import { fetchTeamSpeakClientAvatar } from "./ts-client-avatar.js";

export type { TSChatMessage } from "./ts-client-protocol.js";
export type { TSDirectoryChannel, TSDirectoryClient, TSDirectorySnapshot } from "./ts-client-directory.js";

export interface TSClientOptions {
  target: TeamSpeakTarget;
  nickname: string;
  serverPassword?: string;
  defaultChannel?: string;
  channelPassword?: string;
  identity?: Identity;
}

export interface TSVoiceData {
  clientId: number;
  codec: number; // 4 = voice, 5 = music
  data: Buffer;
  /**
   * S2C packet flags (high nibble): 0x10 extension byte, 0x40 trailer.
   * 上游 VoiceDataEvent 已不透出包头 flags（拍板 2026-11-05，vendor/teamspeak/
   * VENDOR.md 在案）：置值恒为 undefined，下游 splitVoicePayload 按无可选字节
   * 处理——官方桌面端每连接前 5 包的尾字节不再剥离，0x10 桌面端 nvp 恒 1 不出现。
   */
  flags?: number;
  /** Sender voice sequence (VId; upstream `seq`). */
  vid?: number;
  /** True when the packet arrived as a VoiceWhisper. */
  isWhisper?: boolean;
}

export interface TSClientAvatar {
  /** TeamSpeak's avatar content marker, used to invalidate a cached avatar. */
  cacheKey: string;
  data: Buffer;
}

export type TSRawNotification = NotificationEvent;

export type TSChatScope = "channel" | "server" | "private";

export class TSClient extends EventEmitter {
  private client: TSFullClient | null = null;
  private adapter: TeamSpeakAdapter | null = null;
  private logger: Logger;
  private readonly identity: Identity;
  private clientId = 0;
  private connected = false;
  private connectionGeneration = 0;
  private inputState = { muted: false, accompaniment: false };
  private syncedInputMuted: boolean | null = null;
  private inputStateQueue: Promise<void> = Promise.resolve();
  /** Public password flags by channel id; reset per connection, updated by
   *  channel create/edit/delete notifications. */
  private readonly channelPasswordProtection = new Map<bigint, boolean>();
  private readonly channelTree: ChannelTreeStore;
  private preferredChannelId = 0n;

  constructor(private options: TSClientOptions, logger: Logger) {
    super();
    this.logger = logger.child({ nickname: options.nickname });
    this.identity = options.identity ?? generateIdentitySync(8);
    this.channelTree = new ChannelTreeStore(
      () => this.channelPasswordProtection,
      () => {
        const client = this.client;
        if (!client) throw new Error("TeamSpeak session is not ready");
        return tsListChannelsFull(client);
      },
      () => this.client !== null && this.connected,
      () => this.connectionGeneration,
      (channels) => {
        // clients: [] — the directory synchronizer merges clients into its
        // current member view; a channel refresh must not resurrect or drop
        // members the event stream already tracks.
        this.emit("directorySnapshot", { channels, clients: [] });
      },
      (error: unknown) => {
        this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not refresh the TeamSpeak channel tree");
      },
    );
  }

  async connect(): Promise<void> {
    this.connectionGeneration++;
    this.inputState = { muted: false, accompaniment: false };
    this.syncedInputMuted = null;
    this.inputStateQueue = Promise.resolve();
    this.channelTree.clear();
    if (!this.adapter || !this.client) {
      this.adapter = new TeamSpeakAdapter({
        target: this.options.target,
        nickname: this.options.nickname,
        identity: this.identity,
        serverPassword: this.options.serverPassword,
        defaultChannel: this.options.defaultChannel,
        channelPassword: this.options.channelPassword,
      }, this.logger);
      this.client = this.adapter.client;
      this.attachClientListeners(this.client);
    }
    const adapter = this.adapter;
    const client = this.client;

    await adapter.connect();

    this.clientId = client.clientID;
    try {
      // A native TeamSpeak client subscribes to the complete channel tree
      // after the welcome sequence. Without this command the server only
      // exposes members in the current channel, so users disappear as soon as
      // they move elsewhere even though both clients are on the same server.
      await subscribeAllChannels(client);
    } catch (error: unknown) {
      this.logger.warn({
        err: error instanceof Error ? error.message : String(error),
      }, "Could not subscribe to all TeamSpeak channels");
    }

    // TS6 can finish the welcome event stream before it has exposed every
    // existing client to a newly connected session. Pull one authoritative
    // snapshot through this same client protocol session so users who joined
    // earlier are visible immediately as well. Realtime events continue to
    // keep the snapshot current after this reconciliation.
    try {
      const [listing, clients] = await Promise.all([
        tsListChannelsFull(client),
        tsListClientsFull(client),
      ]);
      this.channelTree.applyListing(listing);
      // 锁标记随同一条 channellist 读出；失败只损失锁标记，不影响目录本体。
      for (const [id, passwordProtected] of listing.flags) this.channelPasswordProtection.set(id, passwordProtected);
      this.emit("directorySnapshot", { channels: this.channelTree.decorated(), clients });
    } catch (error: unknown) {
      this.logger.warn({
        failureCode: "DIRECTORY_SNAPSHOT_UNAVAILABLE",
        failureDetail: error instanceof Error ? error.message : String(error),
      }, "TeamSpeak directory snapshot unavailable");
    }

    const connectedChannelId = client.channelID;
    if (this.preferredChannelId === 0n) {
      this.preferredChannelId = connectedChannelId;
    } else if (connectedChannelId !== this.preferredChannelId) {
      try {
        await moveClient(client, asClientID(this.clientId), asChannelID(this.preferredChannelId));
      } catch (error: unknown) {
        // The old channel may have been deleted or become inaccessible. The
        // SDK has already left us in the server/default channel, which is the
        // safe fallback required by the reconnect contract.
        this.logger.info({
          channelId: this.preferredChannelId.toString(),
          err: error instanceof Error ? error.message : String(error),
        }, "Previous TeamSpeak channel could not be restored");
        this.preferredChannelId = client.channelID;
      }
    }
    this.connected = true;

    this.logger.info({ clientId: this.clientId }, "Connected to TeamSpeak");
    this.emit("connected", this.clientId);
  }

  /** Refresh optional member status fields omitted by some client-enter events. */
  async refreshDirectoryClients(): Promise<void> {
    const client = this.client;
    const generation = this.connectionGeneration;
    if (!client || !this.connected) return;
    try {
      const clients = await tsListClientsFull(client);
      if (this.client === client && this.connected && this.connectionGeneration === generation) {
        this.emit("directoryClientsSnapshot", clients);
      }
    } catch (error: unknown) {
      if (this.client === client && this.connected && this.connectionGeneration === generation) {
        this.logger.warn({ err: error instanceof Error ? error.message : String(error) }, "Could not refresh TeamSpeak member statuses");
      }
    }
  }

  /**
   * Load a visible client's TeamSpeak avatar through the client protocol.
   * A missing permission, missing avatar, blocked file-transfer port, or an
   * oversized image is intentionally reported as `null` so the web client can
   * keep its generated initial avatar. The transfer itself lives in
   * ts-client-avatar.ts.
   */
  async getClientAvatar(clientId: number, expectedUid = ""): Promise<TSClientAvatar | null> {
    const client = this.client;
    if (!client || !this.connected) throw new Error("TeamSpeak session is not ready");
    if (!Number.isInteger(clientId) || clientId <= 0 || clientId > 65535) throw new Error("Invalid TeamSpeak client id");
    const generation = this.connectionGeneration;
    return fetchTeamSpeakClientAvatar(
      client,
      this.options.target.host,
      clientId,
      expectedUid,
      () => this.client === client && this.connected && this.connectionGeneration === generation,
    );
  }

  private attachClientListeners(client: TSFullClient): void {
    client.on("voiceData", (event: VoiceDataEvent) => {
      if (this.client !== client) return;
      this.emit("voiceData", {
        clientId: event.clientID,
        codec: event.codec,
        data: Buffer.from(event.data),
        vid: event.seq,
        isWhisper: event.whisper,
      } as TSVoiceData);
    });

    client.on("notification", (notification: NotificationEvent) => {
      if (this.client !== client) return;
      const flagChange = applyChannelPasswordFlagNotification(notification.name, notification.params, this.channelPasswordProtection);
      if (flagChange) this.emit("channelPasswordProtectionChanged", flagChange);
      this.emit("rawNotification", {
        name: notification.name,
        params: { ...notification.params },
      } satisfies TSRawNotification);
    });

    client.on("textMessage", (msg: TextMessageEvent) => {
      if (this.client !== client) return;
      this.emit("textMessage", toTSChatMessage(msg));
    });

    client.on("poked", (event: PokeEvent) => {
      if (this.client !== client) return;
      this.emit("poked", event);
    });

    client.on("disconnected", (event: DisconnectedEvent) => {
      if (this.client !== client) return;
      this.connectionGeneration++;
      if (event.error) {
        const normalized = normalizeTeamSpeakError(event.error);
        this.logger.warn({
          failureCode: normalized.code.toUpperCase(),
          failureDetail: describeTeamSpeakError(normalized),
        }, "TeamSpeak transport disconnected unexpectedly");
      } else {
        this.logger.info("TeamSpeak transport disconnected");
      }
      this.connected = false;
      this.clientId = 0;
      this.channelPasswordProtection.clear();
      this.channelTree.clear();
      this.emit("disconnected", event.error);
    });

    client.on("clientEnter", (event: ClientEnterEvent) => {
      if (this.client !== client) return;
      this.emit("clientEnter", toTSDirectoryClient(event));
    });

    client.on("clientLeave", (event: ClientLeaveEvent) => {
      if (this.client !== client) return;
      this.emit("clientLeave", { id: event.clientID });
    });

    // 上游 kicked 事件直接携带 reason id（4=踢出，5=踢出并封禁），不再需要
    // 从 clientLeave 侧跟踪 selfLeaveReasonId——原因连同 reason id 一起归一化上抛。
    client.on("kicked", (event: KickedEvent) => {
      if (this.client !== client) return;
      this.emit("kicked", normalizeTeamSpeakKickedReason(event.reasonMessage, event.reason));
    });

    client.on("clientMoved", (event: ClientMovedEvent) => {
      if (this.client !== client) return;
      const targetChannelID = BigInt(event.targetChannelID);
      if (event.clientID === this.clientId && targetChannelID !== 0n) this.preferredChannelId = targetChannelID;
      this.emit("clientMoved", { id: event.clientID, targetChannelID });
    });

    client.on("clientUpdated", (event: ClientUpdatedEvent) => {
      if (this.client !== client) return;
      this.emit("clientUpdated", toDirectoryClientChanges(event));
    });

    // 频道树事件：上游已删除 directorySnapshot，改由 typed 事件触发权威
    // channellist 重拉（ChannelTreeStore 去抖合并突发）。
    for (const event of ["channelCreated", "channelEdited", "channelMoved", "channelDeleted", "channelPasswordChanged"] as const) {
      client.on(event, () => {
        if (this.client !== client) return;
        this.channelTree.scheduleRefresh();
      });
    }
  }

  sendVoice(data: Buffer, codec: number = 4): void {
    if (!this.client || !this.connected) return;
    this.client.sendVoice(data, codec as Codec);
  }

  sendWhisper(data: Buffer, clientIds: number[], codec: number = 4): void {
    if (!this.client || !this.connected) return;
    const targets = [...new Set(clientIds)].filter((clientId) => Number.isInteger(clientId) && clientId > 0 && clientId <= 65535 && clientId !== this.getClientId());
    if (!targets.length) throw new Error("Whisper requires at least one valid target");
    this.client.sendWhisper(data, { clients: targets.map(asClientID) }, codec as Codec);
  }

  async sendTextMessage(scope: TSChatScope, message: string, targetId = 0n): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    if (scope === "private") {
      if (targetId <= 0n) throw new Error("A private TeamSpeak message requires a target client");
      await sendPrivateMessage(this.client, asClientID(Number(targetId)), message);
      return;
    }
    if (scope === "server") await sendServerMessage(this.client, message);
    else await sendChannelMessage(this.client, message);
  }

  async poke(clientId: number, message: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    await pokeClient(this.client, asClientID(clientId), message);
  }

  async setAway(away: boolean, message = ""): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    const escaped = escapeTeamSpeakValue(message);
    await this.client.exec(`clientupdate client_away=${away ? 1 : 0} client_away_message=${escaped}`);
  }

  async setInputMuted(muted: boolean): Promise<void> {
    await this.updateInputState({ muted });
  }

  async setAccompanimentActive(accompaniment: boolean): Promise<void> {
    await this.updateInputState({ accompaniment });
  }

  private updateInputState(change: Partial<typeof this.inputState>): Promise<void> {
    const client = this.client;
    const generation = this.connectionGeneration;
    const isCurrent = () => client !== null && this.client === client && this.connected && this.connectionGeneration === generation;
    const update = this.inputStateQueue.then(async () => {
      if (!isCurrent()) throw new Error("TeamSpeak session is not ready");
      const next = { ...this.inputState, ...change };
      const muted = next.muted && !next.accompaniment;
      // TeamSpeak discards all audio from an input-muted client, including
      // music. The browser removes the microphone from its accompaniment mix.
      if (this.syncedInputMuted !== muted) {
        for (let attempt = 0; ; attempt++) {
          if (!isCurrent()) throw new Error("TeamSpeak session is not ready");
          try {
            await client!.exec(`clientupdate client_input_muted=${muted ? 1 : 0}`);
            break;
          } catch (error: unknown) {
            // A failed acknowledgement cannot justify skipping a later update.
            if (isCurrent()) this.syncedInputMuted = null;
            if (!isCurrent() || attempt >= 2 || normalizeTeamSpeakError(error).code !== "flooding") throw error;
            // In particular, stopping accompaniment must get a chance to
            // restore mute after the server's short flood-control window.
            await new Promise<void>(resolve => setTimeout(resolve, (attempt + 1) * 1000));
          }
        }
      }
      if (!isCurrent()) throw new Error("TeamSpeak session changed while updating input state");
      this.syncedInputMuted = muted;
      this.inputState = next;
    });
    this.inputStateQueue = update.catch(() => undefined);
    return update;
  }

  async switchChannel(channelId: bigint, password?: string): Promise<void> {
    if (!this.client || !this.connected) return;
    await moveClient(this.client, asClientID(this.clientId), asChannelID(channelId), password ? { password } : undefined);
    this.preferredChannelId = channelId;
  }

  /** Move another visible TeamSpeak client; the server enforces both move powers. */
  async moveClient(clientId: number, channelId: bigint, password?: string): Promise<void> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    if (!Number.isInteger(clientId) || clientId <= 0 || clientId > 65535) throw new Error("Invalid TeamSpeak client id");
    await moveClient(this.client, asClientID(clientId), asChannelID(channelId), password ? { password } : undefined);
  }

  getClientId(): number {
    // The SDK learns the real client id during the welcome sequence, before
    // TSClient.connect() resumes. Reading it from the SDK prevents the first
    // directory snapshot from being built without the web client itself.
    return this.client?.clientID ?? this.clientId;
  }

  getProtocol(): TeamSpeakProtocol | null {
    return this.adapter?.protocol ?? null;
  }

  async execCommandWithResponse(command: string, timeoutMs = 3000): Promise<Record<string, string>[]> {
    if (!this.client || !this.connected) throw new Error("TeamSpeak session is not ready");
    return this.client.exec(command, { timeoutMs });
  }

  /**
   * Send a TeamSpeak protocol command whose response is delivered later as a
   * notification (for example setupstream/streamsignaling). The command is
   * assembled by the trusted server-side stream adapter, never by the browser.
   * `timeoutMs` bounds the wait for the server's acknowledgement (SDK default
   * 10s): discovery scans pass a shorter bound so one mute server cannot hold
   * a whole pass (报告 21 F4).
   */
  async sendProtocolCommand(command: string, timeoutMs?: number): Promise<void> {
    const client = this.client;
    const generation = this.connectionGeneration;
    const isCurrent = () => client !== null && this.client === client && this.connected && this.connectionGeneration === generation;
    const cleanup = /^(?:stopstream|removeclientfromstream)(?:\s|$)/.test(command);
    for (let attempt = 0; ; attempt++) {
      if (!isCurrent()) throw new Error("TeamSpeak session is not ready");
      try {
        // Stream lifecycle callers need the server's acknowledgement, not
        // merely confirmation that the command was handed to the transport.
        await client!.exec(command, timeoutMs === undefined ? undefined : { timeoutMs });
        if (!isCurrent()) throw new Error("TeamSpeak session changed while sending stream command");
        return;
      } catch (error: unknown) {
        if (!cleanup || !isCurrent() || attempt >= 2 || normalizeTeamSpeakError(error).code !== "flooding") throw error;
        // Only retry an explicit refusal of cleanup. Never replay offers or
        // ICE candidates, and never carry an old cleanup into a new connection.
        await new Promise<void>(resolve => setTimeout(resolve, (attempt + 1) * 4000));
      }
    }
  }

  /**
   * The identity in its secret export form (`parseIdentity` reads it back).
   * The upstream `Identity.toString()` is a safe description without the
   * private key and must never reach persistence.
   */
  getIdentityString(): string {
    return this.identity.export();
  }

  getChannelId(): bigint {
    if (!this.client) return 0n;
    const channelId = this.client.channelID;
    return typeof channelId === "bigint" ? channelId : 0n;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    this.connectionGeneration++;
    this.connected = false;
    this.channelTree.clear();
    try {
      if (this.adapter) await this.adapter.disconnect();
    } finally {
      this.adapter = null;
      this.client = null;
      this.clientId = 0;
    }
  }
}

export type { TSChannelListing };
