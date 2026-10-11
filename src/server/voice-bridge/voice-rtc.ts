import { WebSocket } from "ws";
import type { Logger as LoggerType } from "../../logger.js";
import type { ServerMessage } from "../../shared/server-messages.js";
import { resolveVoiceMediaAddresses } from "../webrtc-config.js";
import type { WebRtcAudioOptions, WebRtcAudioSession, WebRtcAudioSessionOptions, WebRtcSessionDescription } from "../webrtc-audio.js";
import type { WebClientEntry } from "./types.js";

export interface VoiceRtcDeps {
  entries: Map<string, WebClientEntry>;
  logger: LoggerType;
  getWebRtcOptions: () => WebRtcAudioOptions | undefined;
  createWebRtcSession: (options: WebRtcAudioSessionOptions) => WebRtcAudioSession;
}

/** WebRTC audio orchestration for one voice bridge: peer lifecycle (stop) and
 *  offer negotiation, both keyed on generation counters so a stale offer can
 *  never touch a newer peer. */
export function createVoiceRtc(deps: VoiceRtcDeps) {
  async function stopWebRtc(entry: WebClientEntry): Promise<void> {
    const generation = ++entry.webrtcGeneration;
    const peer = entry.webrtc;
    entry.webrtc = null;
    // Enqueue the reset even while an offer is still preparing its first peer.
    // A later offer's input changes are then ordered after this restoration.
    const restoreInput = deps.entries.get(entry.id) === entry && entry.tsClient.isConnected()
      ? entry.tsClient.setAccompanimentActive(false).catch(() => undefined)
      : Promise.resolve();
    if (!peer) { await restoreInput; return; }
    try { await peer.close(); } catch { /* peer teardown is idempotent */ }
    await restoreInput;
    if (entry.webrtcGeneration === generation) {
      try { Object.assign(entry.audio, peer.getStats()); } catch { /* diagnostics must not abort cleanup */ }
    }
  }

  async function handleWebRtcOffer(
    entry: WebClientEntry,
    offer: WebRtcSessionDescription,
    sendJson: (message: ServerMessage) => void,
  ): Promise<void> {
    const closing = stopWebRtc(entry);
    const generation = entry.webrtcGeneration;
    const isCurrent = (): boolean => entry.webrtcGeneration === generation
      && deps.entries.get(entry.id) === entry && entry.session.state === "connected"
      && entry.ws.readyState === WebSocket.OPEN;
    await closing;
    if (!isCurrent()) return;
    const config = deps.getWebRtcOptions();
    if (!config?.enabled) return;
    const muted = offer.muted === true;
    try {
      // The offer carries the browser's initial mute state. WebRTC can silence
      // the browser track locally, but TeamSpeak clients only see the state
      // after the gateway updates its own TS client as well.
      await entry.tsClient.setInputMuted(muted);
      if (isCurrent()) await entry.tsClient.setAccompanimentActive(offer.accompanimentActive === true);
    } catch (error: unknown) {
      if (isCurrent()) deps.logger.warn({ entryId: entry.id, muted, err: error instanceof Error ? error.message : String(error) }, "Could not synchronize initial microphone mute state");
    }
    if (!isCurrent()) return;
    let peer: WebRtcAudioSession | null = null;
    const isCurrentPeer = (): boolean => isCurrent() && peer !== null && entry.webrtc === peer;
    try {
      const publicAddresses = await resolveVoiceMediaAddresses(config.publicHost || entry.webrtcPublicHost, config.ipv6Enabled === true);
      if (!isCurrent()) return;
      peer = deps.createWebRtcSession({
        connectionId: entry.id,
        publicAddresses,
        ...(config.publicHost || entry.webrtcPublicHost ? { publicHost: config.publicHost || entry.webrtcPublicHost } : {}),
        ipv6Enabled: config.ipv6Enabled,
        stunServer: config.stunServer,
        udpPortRange: config.udpPortRange,
        logger: deps.logger,
        microphoneMuted: muted,
        accompanimentActive: offer.accompanimentActive === true,
        onVoiceFrame: (data, codec) => {
          if (isCurrentPeer()) entry.audioTransport?.receiveWebRtc(data, codec);
        },
        onVoiceRoutes: (slots) => {
          if (isCurrentPeer()) sendJson({ type: "voiceRoute", slots: [...slots] });
        },
      });
      entry.webrtc = peer;
      const answer = await peer.createAnswer({ type: offer.type, sdp: offer.sdp });
      if (!isCurrentPeer()) {
        try { await peer.close(); } catch { /* a replaced peer may already be closed */ }
        return;
      }
      sendJson({ type: "webrtcAnswer", payload: { sdp: answer } });
      entry.webrtcEverUsed = true;
      deps.logger.info({ entryId: entry.id }, "WebRTC audio negotiation completed");
    } catch (error: unknown) {
      if (entry.webrtc === peer) entry.webrtc = null;
      try { await peer?.close(); } catch { /* best effort */ }
      if (isCurrent()) {
        try { await entry.tsClient.setAccompanimentActive(false); } catch { /* best effort */ }
        if (!isCurrent()) return;
        deps.logger.warn({ entryId: entry.id, err: error instanceof Error ? error.message : String(error) }, "WebRTC audio negotiation failed");
        sendJson({ type: "webrtcError", code: "WEBRTC_NEGOTIATION_FAILED" });
      }
    }
  }

  return { stopWebRtc, handleWebRtcOffer };
}

export type VoiceRtc = ReturnType<typeof createVoiceRtc>;
