import { WebSocket } from "ws";
import type { ServerMessage } from "../../shared/server-messages.js";
import { parseWebRtcClientMessage } from "../../shared/webrtc.js";
import type { Logger as LoggerType } from "../../logger.js";
import type { SessionTeardownReason } from "../session-manager.js";
import { parseClientCommand } from "../voice-protocol.js";
import { shouldReportRateLimit } from "../command-rate-limit.js";
import { parseScreenShareMessage } from "../screen-share.js";
import { handleCommand } from "../voice-commands.js";
import type { WebRtcAudioOptions, WebRtcSessionDescription } from "../webrtc-audio.js";
import type { ScreenShareCoordinator } from "../screen-share-coordinator.js";
import type { DetachedSessionPool } from "./detached-pool.js";
import type { WebClientEntry } from "./types.js";
import { sendProtocolError } from "./connection-request.js";

/** Structural subset of the bridge deps the socket handlers touch. The
 *  full deps object satisfies it as-is. */
export interface SocketHandlerDeps {
  entries: Map<string, WebClientEntry>;
  logger: LoggerType;
  teardown: (entryId: string, reason: SessionTeardownReason) => Promise<void>;
  getWebRtcOptions: () => WebRtcAudioOptions | undefined;
  stopWebRtc: (entry: WebClientEntry) => Promise<void>;
  handleWebRtcOffer: (entry: WebClientEntry, offer: WebRtcSessionDescription, sendJson: (message: ServerMessage) => void) => Promise<void>;
  screenShares: ScreenShareCoordinator;
  detachedPool: DetachedSessionPool;
}

export interface SocketHandlerContext {
  deps: SocketHandlerDeps;
  entryId: string;
  getEntry: () => WebClientEntry | null;
  /** True only in the fully synced state: control traffic before that would
   *  race the directory sync. */
  isSessionReady: () => boolean;
  sendJson: (message: ServerMessage) => void;
}

/** Register the browser-socket handlers. Runs for the initial join and
 *  again for every adopted resume socket; all state it touches is
 *  entry-level via the context getters, never socket-level. */
export function bindSocketHandlers(ctx: SocketHandlerContext, socket: WebSocket): void {
  const { deps, entryId } = ctx;
  const entry = ctx.getEntry;
  socket.on("pong", () => { if (entry()) entry()!.isAlive = true; });
  socket.on("message", (data: Buffer | string, isBinary: boolean) => {
    const current = entry();
    if (!current || deps.entries.get(entryId) !== current) return;
    if (isBinary) {
      current.audioTransport?.receivePcm(typeof data === "string" ? Buffer.from(data) : data);
      return;
    }
    // Control messages (probes, chat, screen share, renegotiations) all end
    // in gateway or TeamSpeak work; the TS server's flood protection bans
    // the gateway identity shared by every session, so one abusive client
    // must not be able to trigger it for everyone.
    if (!current.commandLimiter.tryRemoveToken()) {
      const now = Date.now();
      if (shouldReportRateLimit(current.lastRateLimitNoticeAt, now)) {
        current.lastRateLimitNoticeAt = now;
        sendProtocolError(ctx.sendJson, "RATE_LIMITED", "操作过于频繁，请稍后重试");
      }
      return;
    }

    const rawMessage = typeof data === "string" ? data : data.toString("utf-8");
    const webRtcMessage = parseWebRtcClientMessage(rawMessage);
    if (webRtcMessage?.type === "webrtcOffer") {
      if (deps.getWebRtcOptions()?.enabled !== true) {
        sendProtocolError(ctx.sendJson, "WEBRTC_DISABLED", "WebRTC 音频传输未启用");
        return;
      }
      if (!ctx.isSessionReady()) {
        sendProtocolError(ctx.sendJson, "SESSION_NOT_READY", "TeamSpeak 会话尚未就绪");
        return;
      }
      const { sdp, muted, accompanimentActive } = webRtcMessage.payload;
      void deps.handleWebRtcOffer(current, { ...sdp, muted, accompanimentActive }, ctx.sendJson);
      return;
    }
    if (webRtcMessage?.type === "webrtcStop") {
      void deps.stopWebRtc(current);
      return;
    }
    const screenShareMessage = parseScreenShareMessage(rawMessage);
    if (screenShareMessage) {
      if ("error" in screenShareMessage) {
        sendProtocolError(ctx.sendJson, screenShareMessage.error.code, screenShareMessage.error.message);
        return;
      }
      if (!ctx.isSessionReady()) {
        sendProtocolError(ctx.sendJson, "SESSION_NOT_READY", "TeamSpeak 会话尚未就绪");
        return;
      }
      deps.screenShares.handleMessage(current, screenShareMessage, ctx.sendJson);
      return;
    }
    const command = parseClientCommand(rawMessage);
    if ("error" in command) {
      sendProtocolError(ctx.sendJson, command.error.code, command.error.message);
      return;
    }
    if (!ctx.isSessionReady()) {
      sendProtocolError(ctx.sendJson, "SESSION_NOT_READY", "TeamSpeak 会话尚未就绪", command.requestId);
      return;
    }
    void handleCommand(current, command, ctx.sendJson);
  });
  socket.on("close", (code) => {
    deps.logger.info({ entryId, code, detached: entry()?.detached === true }, "WebSocket closed");
    // 1000 is a deliberate leave (user disconnect or server-initiated
    // teardown): release everything. Any other close — reload, network
    // loss, proxy drop — keeps the TeamSpeak session for the resume
    // window when the session holds a reconnect ticket at all.
    if (code === 1000 || !deps.detachedPool.canDetach(entry())) {
      void deps.teardown(entryId, "websocket-close");
      return;
    }
    deps.detachedPool.detach(entry()!);
  });
  // The close event decides detach vs teardown; an error alone (usually
  // followed by an abnormal close) must not pre-empt that decision.
  socket.on("error", (error) => {
    deps.logger.warn({ entryId, err: error instanceof Error ? error.message : String(error) }, "WebSocket error");
  });
}
