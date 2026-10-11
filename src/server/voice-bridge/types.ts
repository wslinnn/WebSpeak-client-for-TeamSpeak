import type { WebSocket } from "ws";
import type { AudioFlowStats } from "../audio-stats.js";
import type { SessionAudioTransport } from "../session-audio.js";
import type { SessionDirectoryState, SessionEventCoordinator } from "../session-events.js";
import type { ManagedSession } from "../session-manager.js";
import type { TSClient } from "../ts-client.js";
import type { CommandRateLimiter } from "../command-rate-limit.js";
import type { WebRtcAudioSession } from "../webrtc-audio.js";
import type { TeamSpeakTarget } from "../../domain/teamspeak-target.js";
import type { ServerEvent as SharedServerEvent } from "../../shared/voice-models.js";

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
