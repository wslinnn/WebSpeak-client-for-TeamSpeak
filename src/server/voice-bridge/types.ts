import type { WebSocket } from "ws";
import type { AudioFlowStats } from "../audio-stats.js";
import type { SessionAudioTransport, VoiceEncoder } from "../session-audio.js";
import type { SessionDirectoryState, SessionEventCoordinator } from "../session-events.js";
import type { ManagedSession } from "../session-manager.js";
import type { TSClient, TSClientOptions } from "../ts-client.js";
import type { Logger as LoggerType } from "../../logger.js";
import type { CommandRateLimiter } from "../command-rate-limit.js";
import type { WebRtcAudioOptions, WebRtcAudioSession } from "../webrtc-audio.js";
import type { ScreenShareIceServer } from "../screen-share.js";
import type { ServerPasswordGuard } from "../server-password-guard.js";
import type { JoinTicketStore } from "../join-ticket.js";
import type { ReconnectTicketStore } from "../reconnect-ticket.js";
import type { TeamSpeakTarget } from "../../domain/teamspeak-target.js";
import type { ServerEvent as SharedServerEvent } from "../../shared/voice-models.js";

export interface VoiceBridgeOptions {
  joinTickets: JoinTicketStore;
  reconnectTickets?: ReconnectTicketStore;
  /** How long a detached (browser-gone, TeamSpeak-kept) session waits for its
   *  resume before the kept TeamSpeak connection is released. */
  resumeGraceMs?: number;
  webRtc?: WebRtcAudioOptions | (() => WebRtcAudioOptions);
  screenShareIceServers?: ScreenShareIceServer[] | (() => ScreenShareIceServer[]);
  /** Declares the reverse proxy in front of the gateway. Forwarded headers are
   *  believed only when the peer that sent them is in `trustedProxies`; this
   *  flag alone means the same-host (loopback) proxy. */
  trustProxy?: boolean;
  /** IPs/CIDRs of proxies whose forwarding headers may be believed. Overrides
   *  `trustProxy`. Empty or absent with no `trustProxy` means never believe. */
  trustedProxies?: readonly string[];
  serverPasswordGuard?: ServerPasswordGuard;
}

export interface VoiceBridgeDependencies {
  createTeamSpeakClient?(options: TSClientOptions, logger: LoggerType): TSClient;
  createEncoder?(): VoiceEncoder;
}

export type ServerEvent = SharedServerEvent & { kind: "joined" | "left" | "moved" | "poke" | "connection" };

export interface WebClientEntry extends SessionDirectoryState {
  id: string;
  session: ManagedSession;
  tsClient: TSClient;
  ws: WebSocket;
  nickname: string;
  rememberIdentity: boolean;
  clientIp: string;
  target: TeamSpeakTarget;
  identityLeaseKey?: string;
  webrtcPublicHost?: string;
  events: SessionEventCoordinator | null;
  eventLog: ServerEvent[];
  audioTransport: SessionAudioTransport | null;
  isAlive: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  audio: AudioFlowStats;
  webrtc: WebRtcAudioSession | null;
  webrtcGeneration: number;
  lastLatencyProbeAt: number;
  lastAudioStatsProbeAt: number;
  commandLimiter: CommandRateLimiter;
  lastRateLimitNoticeAt: number;
  connectedOnce: boolean;
  webrtcEverUsed: boolean;
  connectionFailureCode?: string;
  screenPeerId: string;
  /** Token delivered in `connected` for browser reload/drop recovery. */
  reconnectTicketToken?: string;
  /** Session kept alive while its browser is gone (see detachEntry): no live
   *  socket, TeamSpeak connection and directory state held for the resume
   *  window, then released by the heartbeat sweep. */
  detached?: boolean;
  detachedAt?: number;
  /** Set by the owning connection closure: rebinds a resume socket onto the
   *  kept session (re-registering handlers, recreating the audio transport
   *  and resending initial state) without touching TeamSpeak. Returns false
   *  when the session is no longer attachable. */
  attachSocket?: (socket: WebSocket) => boolean;
}
