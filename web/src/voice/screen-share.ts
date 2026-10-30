import { createStore } from "zustand/vanilla";
import { parseScreenShareStream, parseScreenShareViewers, type ServerMessage } from "@shared/server-messages";
import { normalizeScreenShareIceServers, type ScreenShareIceServer, type ScreenShareClientMessage, type ScreenShareStreamDescription as ScreenShareStream, type ScreenSharePeerSignal as ScreenShareSignal } from "@shared/screen-share";
import { declareStereoOpusOffer } from "./screen-share-sdp";

const SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS = 15_000;
// Screen audio rides pure P2P (no TeamSpeak budget): a music-grade send
// target on the owner side. The negotiated fmtp ceiling (our offers declare
// stereo + 510 kbps receive) remains the harder cap above this target.
const SCREEN_SHARE_AUDIO_SEND_BITRATE_BPS = 128_000;
// ICE/DTLS success is not picture success: a connected peer can stay black
// when the publisher stalled. The first actually decoded frame is the proof
// that watching works; until then the viewer gets a Progress note, and a
// connected-but-frameless peer gets an explicit stall diagnosis instead of an
// infinite spinner (Piik decoded-frame-proof 同源，路由无切换时仅作观看诊断).
const SCREEN_SHARE_FIRST_FRAME_PROOF_TICK_MS = 500;
const SCREEN_SHARE_FIRST_FRAME_PROOF_TIMEOUT_MS = 10_000;
// Each peer gets one ICE-restart retry (slow candidate exchange gets a second
// gathering window); the budget is consumed by whichever arrives first — the
// negotiation timer or a `failed` connection state.
const SCREEN_SHARE_CONNECT_RETRIES = 1;

export interface ScreenShareOutputSettings {
  maxWidth?: number;
  maxHeight?: number;
  maxFrameRate?: number;
  maxBitrate?: number;
  /** 降级策略（Piik 画面偏好三态同源）：清晰=保分辨率押帧率、均衡、流畅=保帧率。 */
  degradationPreference?: "maintain-resolution" | "balanced" | "maintain-framerate";
  /** 编码偏好用户入口：auto=H264>AV1>VP8（现状默认）、h264/vp8=强制把所选编码排到首位。 */
  codecPreference?: "auto" | "h264" | "vp8";
}

/** View-facing screen-share state. Stream objects are replaced (never
 *  mutated) so consumer memoization can rely on reference identity. */
export interface ScreenShareView {
  streams: ScreenShareStream[];
  active: boolean;
  starting: boolean;
  activeStreamId: string;
  viewing: boolean;
  viewingStreamId: string;
  remoteStream: MediaStream | null;
  error: string;
  errorCode: string;
  remoteVolume: number;
}

export type { ScreenShareCaptureStats, ScreenSharePeerStats, ScreenShareWebRtcStats } from "./screen-share-stats";
import { createScreenShareStats, summarizeIceFailure } from "./screen-share-stats";

interface ScreenShareTransport {
  isOpen(): boolean;
  send(message: ScreenShareClientMessage): void;
}

/** Owns one session's capture tracks, peers, signaling and diagnostics. */
export function createScreenShareController(transport: ScreenShareTransport) {
  let screenShareIceServers: RTCIceServer[] = normalizeScreenShareIceServers();
  const store = createStore<ScreenShareView>(() => ({
    streams: [], active: false, starting: false, activeStreamId: "", viewing: false,
    viewingStreamId: "", remoteStream: null, error: "", errorCode: "", remoteVolume: 1,
  }));
  const V = () => store.getState();
  let screenShareLocalStream: MediaStream | null = null;
  // These are encoder/output limits. The display track itself must keep the
  // source resolution so selecting a high-resolution desktop or game window
  // never changes that source before capture.
  let screenShareOutputSettings: ScreenShareOutputSettings | null = null;
  const screenSharePeers = new Map<string, RTCPeerConnection>();
  const screenSharePeerRoles = new Map<string, "owner" | "viewer">();
  const screenShareStats = createScreenShareStats({
    getLocalVideoTrack: () => screenShareLocalStream?.getVideoTracks()[0],
    getPeers: () => screenSharePeers,
    getPeerRoles: () => screenSharePeerRoles,
    isCurrentPeer,
  });
  const screenSharePendingIce = new Map<string, RTCIceCandidateInit[]>();
  const screenSharePeerStreams = new Map<string, MediaStream>();
  const screenSharePeerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const screenSharePeerRetries = new Map<string, number>();
  const screenShareSentCandidates = new Map<string, number>();
  let screenShareRequestSequence = 0;
  let screenSharePendingStartId = "";
  let screenShareStartCancelled = false;
  let screenShareStartGeneration = 0;

  function sendScreenShareMessage(message: ScreenShareClientMessage): void {
    if (transport.isOpen()) transport.send(message);
  }

  function clearScreenSharePeerTimer(peerId: string): void {
    const timer = screenSharePeerTimers.get(peerId);
    if (!timer) return;
    clearTimeout(timer);
    screenSharePeerTimers.delete(peerId);
  }

  function restartScreenShareIce(peerId: string, peer: RTCPeerConnection): boolean {
    const attempts = screenSharePeerRetries.get(peerId) ?? 0;
    if (attempts >= SCREEN_SHARE_CONNECT_RETRIES) return false;
    screenSharePeerRetries.set(peerId, attempts + 1);
    try {
      peer.restartIce();
    } catch {
      return false;
    }
    return true;
  }

  const screenShareFrameProofTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function stopFirstFrameProof(peerId: string): void {
    const timer = screenShareFrameProofTimers.get(peerId);
    if (!timer) return;
    clearTimeout(timer);
    screenShareFrameProofTimers.delete(peerId);
  }

  async function readFirstDecodedFrame(peer: RTCPeerConnection, track: MediaStreamTrack): Promise<number> {
    try {
      const receiver = typeof peer.getReceivers === "function" ? peer.getReceivers().find(candidate => candidate.track === track) : null;
      if (!receiver?.getStats) return 0;
      const stats = await receiver.getStats();
      let decoded = 0;
      stats?.forEach((report) => {
        const entry = report as { type?: string; kind?: string; framesDecoded?: number };
        if (entry.type === "inbound-rtp" && entry.kind === "video" && typeof entry.framesDecoded === "number") {
          decoded = Math.max(decoded, entry.framesDecoded);
        }
      });
      return decoded;
    } catch {
      return 0;
    }
  }

  /** 观看端首帧证明：ontrack 只说明 SDP 已应用，不说明有画面。探针
   *  轮询接收端 framesDecoded，首帧落地即静默退役；连接打开后 10s 仍无
   *  帧才给观看者本地 stall 诊断（慢 ICE 不计窗口——预算从连接真正打开
   *  起算；协商死线无论此刻是否连接都由既有 timer 兜底）。 */
  function startFirstFrameProof(peerId: string, peer: RTCPeerConnection, track: MediaStreamTrack): void {
    stopFirstFrameProof(peerId);
    const startedAt = Date.now();
    let openedAt = 0;
    const schedule = (): void => {
      screenShareFrameProofTimers.set(peerId, setTimeout(tick, SCREEN_SHARE_FIRST_FRAME_PROOF_TICK_MS));
    };
    const tick = (): void => {
      screenShareFrameProofTimers.delete(peerId);
      if (!screenSharePeers.has(peerId)) return;
      if (peer.connectionState !== "connected") {
        // 慢 ICE 阶段不计画面窗口：未连接期的失败由协商死线兜底；探针仅在
        // 双倍预算内陪跑，超了静默退役，避免与协商超时叠报。
        if (Date.now() - startedAt < SCREEN_SHARE_FIRST_FRAME_PROOF_TIMEOUT_MS * 2) schedule();
        return;
      }
      if (!openedAt) openedAt = Date.now();
      void readFirstDecodedFrame(peer, track).then((decoded) => {
        if (!screenSharePeers.has(peerId)) return;
        if (decoded > 0 || Date.now() - openedAt >= SCREEN_SHARE_FIRST_FRAME_PROOF_TIMEOUT_MS) {
          if (decoded === 0) {
            store.setState({ error: "直连已建立但迟迟没有画面帧：共享端可能已停止画面或编码卡住，可停止观看后重新观看" });
          }
          return;
        }
        schedule();
      });
    };
    schedule();
  }

  function armScreenSharePeerTimer(peerId: string): void {
    if (!screenSharePeers.has(peerId)) return;
    clearScreenSharePeerTimer(peerId);
    screenSharePeerTimers.set(peerId, setTimeout(() => {
      screenSharePeerTimers.delete(peerId);
      const peer = screenSharePeers.get(peerId);
      if (!peer) return;
      if (restartScreenShareIce(peerId, peer)) {
        armScreenSharePeerTimer(peerId);
        return;
      }
      failScreenSharePeer(peerId, "屏幕共享直连协商超时，请确认双方网络允许浏览器直连");
    }, SCREEN_SHARE_NEGOTIATION_TIMEOUT_MS));
  }

  function closeScreenSharePeer(peerId: string): void {
    clearScreenSharePeerTimer(peerId);
    stopFirstFrameProof(peerId);
    const peer = screenSharePeers.get(peerId);
    screenSharePeers.delete(peerId);
    screenSharePeerRoles.delete(peerId);
    screenSharePeerRetries.delete(peerId);
    screenShareSentCandidates.delete(peerId);
    screenShareStats.forgetPeer(peerId);
    screenSharePendingIce.delete(peerId);
    screenSharePeerStreams.get(peerId)?.getTracks().forEach(track => track.stop());
    screenSharePeerStreams.delete(peerId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
    }
    try { peer?.close(); } catch { /* closing an already closed peer is harmless */ }
    if (!screenSharePeers.size) screenShareStats.stopPolling();
  }

  function closeAllScreenSharePeers(): void {
    for (const peerId of [...screenSharePeers.keys()]) closeScreenSharePeer(peerId);
    for (const timer of screenSharePeerTimers.values()) clearTimeout(timer);
    screenSharePeerTimers.clear();
    screenSharePendingIce.clear();
    screenShareStats.stopPolling();
  }

  function isCurrentPeer(peerId: string, peer: RTCPeerConnection): boolean {
    return transport.isOpen() && screenSharePeers.get(peerId) === peer;
  }

  function setScreenShareP2PError(message = "直连 P2P 失败，当前网络无法建立浏览器之间的直接连接") {
    store.setState({ errorCode: "", error: message });
  }

  function failScreenSharePeer(peerId: string, message?: string): void {
    const viewingStream = V().streams.find((stream) => stream.streamId === V().viewingStreamId && stream.ownerPeerId === peerId);
    if (viewingStream) sendScreenShareMessage({ type: "screenShareLeave", streamId: viewingStream.streamId });
    const sentCandidates = screenShareSentCandidates.get(peerId) ?? 0;
    // collectStats must run before close(): a closed peer rejects getStats,
    // and iceGatheringState is a fail-time verdict the stats report cannot
    // recover afterwards — both are captured pre-close.
    const failingPeer = screenSharePeers.get(peerId);
    const gatheringState = failingPeer?.iceGatheringState ?? "";
    const failureSummary = viewingStream && failingPeer ? summarizeIceFailure(failingPeer, screenShareIceServers, { gatheringState }) : Promise.resolve(null);
    closeScreenSharePeer(peerId);
    if (viewingStream) {
      store.setState({ viewing: false, viewingStreamId: "", remoteStream: null });
      const baseMessage = message ?? "直连 P2P 失败，当前网络无法建立浏览器之间的直接连接";
      setScreenShareP2PError(baseMessage);
      void failureSummary.then((summary) => {
        // Only augment if the failure message is still the one on display.
        if (summary && V().error === baseMessage) {
          store.setState({ error: `${baseMessage}（本端已发送 ${sentCandidates} 个候选；诊断：${summary}）` });
        }
      });
    }
    // Facet separation: a viewer's failed watch attempt surfaces only on the
    // viewer (the owner UI must not paint a fatal banner for one viewer's
    // network). The owner still leaves a console trail so its DevTools can
    // answer「共享端到底有没有应答/在哪一步失败」without UI noise.
    if (!viewingStream) {
      console.info(`[screen-share] 观看者 ${peerId} 连接失败已清理：${message ?? "ICE 失败"}（本端已发送 ${sentCandidates} 个候选，收集状态：${gatheringState || "未知"}）`);
    }
  }

  function createScreenSharePeer(streamId: string, peerId: string, role: "owner" | "viewer"): RTCPeerConnection {
    const existing = screenSharePeers.get(peerId);
    if (existing) return existing;
    // STUN discovers server-reflexive candidates; it does not carry media.
    // TURN is accepted only when explicitly configured by the deployment, and
    // would use that external TURN service rather than the WebSpeak gateway.
    const peer = new RTCPeerConnection({ iceServers: screenShareIceServers });
    screenSharePeers.set(peerId, peer);
    screenSharePeerRoles.set(peerId, role);
    screenShareStats.startPolling();
    if (role === "owner") {
      for (const track of screenShareLocalStream?.getTracks() ?? []) {
        const sender = peer.addTrack(track, screenShareLocalStream!);
        if (track.kind === "video") void configureScreenShareVideoSender(sender, track);
        else if (track.kind === "audio") void configureScreenShareAudioSender(sender);
      }
    } else {
      peer.addTransceiver("video", { direction: "recvonly" });
      const stream = V().streams.find((candidate) => candidate.streamId === streamId);
      if (stream?.audio) peer.addTransceiver("audio", { direction: "recvonly" });
    }
    // 编码偏好仅在共享端生效：浏览器共享流里 codec 由共享端 sender 决定，
    // 观看端只接收；TS6 来源流的编码则是 TS6 自己的选择。
    preferScreenShareCodecs(peer, role === "owner" ? screenShareOutputSettings?.codecPreference : undefined);
    peer.onicecandidate = (event) => {
      if (!isCurrentPeer(peerId, peer) || !event.candidate) return;
      screenShareSentCandidates.set(peerId, (screenShareSentCandidates.get(peerId) ?? 0) + 1);
      const candidate = event.candidate;
      sendScreenShareMessage({
        type: "screenShareSignal",
        streamId,
        targetPeerId: peerId,
        signal: {
          kind: "iceCandidate",
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        },
      });
    };
    peer.addEventListener("icegatheringstatechange", () => {
      if (!isCurrentPeer(peerId, peer) || peer.iceGatheringState !== "complete") return;
      console.info(`[screen-share] ${role === "owner" ? "共享端" : "观看端"}候选收集完成：已向对端 ${peerId} 发送 ${screenShareSentCandidates.get(peerId) ?? 0} 个候选`);
    });
    peer.ontrack = (event) => {
      if (!isCurrentPeer(peerId, peer) || role !== "viewer") return;
      // The negotiation deadline stays armed until the connection itself
      // proves itself: ontrack fires with the SDP, not with picture. Clearing
      // here once left slow-ICE viewers in an unguarded endless spinner.
      const remote = event.streams[0] ?? screenSharePeerStreams.get(peerId) ?? new MediaStream();
      if (!event.streams[0]) remote.addTrack(event.track);
      screenSharePeerStreams.set(peerId, remote);
      store.setState({ remoteStream: remote, viewing: true });
      startFirstFrameProof(peerId, peer, event.track);
    };
    peer.onconnectionstatechange = () => {
      if (!isCurrentPeer(peerId, peer)) return;
      // `completed` belongs to RTCIceConnectionState, not the aggregate
      // RTCPeerConnection.connectionState. Treating it as a connection state
      // both trips the type checker and can hide the actual failed/closed
      // transitions we need to handle here.
      if (peer.connectionState === "connected") {
        clearScreenSharePeerTimer(peerId);
        screenSharePeerRetries.delete(peerId);
      } else if (peer.connectionState === "failed") {
        if (!restartScreenShareIce(peerId, peer)) failScreenSharePeer(peerId);
      }
      if (peer.connectionState === "closed" && screenSharePeers.get(peerId) === peer) closeScreenSharePeer(peerId);
    };
    return peer;
  }

  async function configureScreenShareAudioSender(sender: RTCRtpSender): Promise<void> {
    if (!sender.setParameters) return;
    try {
      const parameters = sender.getParameters();
      const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      encodings[0] = { ...encodings[0]!, maxBitrate: SCREEN_SHARE_AUDIO_SEND_BITRATE_BPS };
      parameters.encodings = encodings;
      await sender.setParameters(parameters);
    } catch {
      // Same silent-catch contract as the video sender until the parameter
      // read-back audit lands (屏幕共享诊断透出 param audit).
    }
  }

  async function configureScreenShareVideoSender(sender: RTCRtpSender, track: MediaStreamTrack): Promise<void> {
    if (!sender.setParameters || track.kind !== "video") return;
    try {
      const settings = track.getSettings();
      const requested = screenShareOutputSettings;
      const sourceWidth = typeof settings.width === "number" && settings.width > 0 ? settings.width : null;
      const sourceHeight = typeof settings.height === "number" && settings.height > 0 ? settings.height : null;
      const targetWidth = requested?.maxWidth ?? sourceWidth;
      const targetHeight = requested?.maxHeight ?? sourceHeight;
      const scaleResolutionDownBy = sourceWidth && sourceHeight && targetWidth && targetHeight
        ? Math.max(1, sourceWidth / targetWidth, sourceHeight / targetHeight)
        : 1;
      const sourceFrameRate = typeof settings.frameRate === "number" && settings.frameRate > 0 ? settings.frameRate : null;
      const targetFrameRate = requested?.maxFrameRate
        ? Math.max(1, Math.min(requested.maxFrameRate, sourceFrameRate ?? requested.maxFrameRate))
        : sourceFrameRate;
      const parameters = sender.getParameters();
      const encodings = parameters.encodings?.length ? parameters.encodings : [{}];
      const firstEncoding = { ...encodings[0] };
      if (scaleResolutionDownBy > 1.01) firstEncoding.scaleResolutionDownBy = scaleResolutionDownBy;
      if (targetFrameRate) firstEncoding.maxFramerate = targetFrameRate;
      // Give the encoder a generous bitrate budget for screen content so the
      // congestion controller does not squeeze it down to a blurry trickle on
      // relayed (TURN) links. By default the budget scales with the target
      // output height (1080p -> 8 Mbps, 720p -> 5 Mbps, 480p -> 3 Mbps,
      // 360p -> 1.5 Mbps); a user-provided maxBitrate always wins so viewers
      // can trade quality against network headroom manually.
      const outputHeight = targetHeight ?? sourceHeight;
      const userBitrate = typeof requested?.maxBitrate === "number" && requested.maxBitrate > 0 ? requested.maxBitrate : null;
      const maxBitrate = userBitrate ?? (
        outputHeight && outputHeight > 0
          ? outputHeight >= 1080
            ? 8_000_000
            : outputHeight >= 720
              ? 5_000_000
              : outputHeight >= 480
                ? 3_000_000
                : 1_500_000
          : 8_000_000
      );
      firstEncoding.maxBitrate = maxBitrate;
      parameters.encodings = [firstEncoding, ...encodings.slice(1)];
      // Default keeps resolution/detail crisp under pressure and lets the
      // encoder drop frame rate; screen share quality is judged by
      // readability of the shared content. User choice overrides (Piik
      // 画面偏好三态：清晰/均衡/流畅 → degradationPreference).
      parameters.degradationPreference = requested?.degradationPreference ?? "maintain-resolution";
      await sender.setParameters(parameters);
    } catch {
      // Older browsers may reject one of the optional sender parameters. The
      // track remains usable and the diagnostics panel still exposes the real
      // negotiated frame rate and dimensions.
    }
  }

  function preferScreenShareCodecs(peer: RTCPeerConnection, codecPreference?: "auto" | "h264" | "vp8"): void {
    const transceiver = peer.getTransceivers().find((candidate) => candidate.sender.track?.kind === "video" || candidate.receiver.track?.kind === "video");
    // Sender capabilities, not receiver: setCodecPreferences constrains what
    // WE encode, and Chrome rejects receiver-side codec lists with
    // InvalidModificationError — which silently disabled every preference.
    const capabilities = typeof RTCRtpSender !== "undefined" ? RTCRtpSender.getCapabilities?.("video") : null;
    if (!transceiver?.setCodecPreferences || !capabilities?.codecs?.length) return;
    // Prefer H.264/AV1 for screen content: both compress text/UI far better
    // than VP8 at the bitrates typical of relayed screen shares. All three are
    // listed in that order so AV1 keeps its place ahead of VP8 even when
    // H.264 is present but the browser's own codec order would put VP8 next.
    // A user-forced codec is simply promoted to the front of the list; the
    // rest of the order stays as fallback so an unusable codec still degrades
    // gracefully instead of failing negotiation.
    const mimeOrder = codecPreference === "vp8"
      ? ["video/vp8", "video/h264", "video/av1"]
      : codecPreference === "h264"
        ? ["video/h264", "video/av1", "video/vp8"]
        : ["video/h264", "video/av1", "video/vp8"];
    const preferred = mimeOrder.flatMap((mimeType) =>
      capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() === mimeType),
    );
    if (!preferred.length) return;
    const remaining = capabilities.codecs.filter((codec) => !preferred.includes(codec));
    try { transceiver.setCodecPreferences([...preferred, ...remaining]); } catch { /* older browsers may reject codec preference changes */ }
  }

  async function flushScreenShareCandidates(peerId: string, peer: RTCPeerConnection): Promise<void> {
    const pending = screenSharePendingIce.get(peerId) ?? [];
    screenSharePendingIce.delete(peerId);
    for (const candidate of pending) {
      if (!isCurrentPeer(peerId, peer)) return;
      try { await peer.addIceCandidate(candidate); } catch { /* an obsolete candidate can be ignored */ }
    }
  }

  async function startScreenShareViewer(stream: ScreenShareStream): Promise<void> {
    closeAllScreenSharePeers();
    store.setState({ remoteStream: null, viewing: true, viewingStreamId: stream.streamId, errorCode: "", error: "" });
    const peer = createScreenSharePeer(stream.streamId, stream.ownerPeerId, "viewer");
    if (stream.source === "teamspeak") {
      armScreenSharePeerTimer(stream.ownerPeerId);
      return;
    }
    try {
      const offer = await peer.createOffer();
      if (!isCurrentPeer(stream.ownerPeerId, peer)) return;
      await peer.setLocalDescription({ type: offer.type, sdp: declareStereoOpusOffer(offer.sdp ?? "") });
      if (!isCurrentPeer(stream.ownerPeerId, peer)) return;
      armScreenSharePeerTimer(stream.ownerPeerId);
      sendScreenShareMessage({
        type: "screenShareSignal",
        streamId: stream.streamId,
        targetPeerId: stream.ownerPeerId,
        signal: { kind: "offer", sdp: peer.localDescription?.sdp ?? offer.sdp ?? "" },
      });
    } catch {
      if (isCurrentPeer(stream.ownerPeerId, peer)) failScreenSharePeer(stream.ownerPeerId, "无法创建屏幕共享直连请求，请重试");
    }
  }

  async function startNativeScreenShareViewer(streamId: string, peerId: string): Promise<void> {
    const stream = V().streams.find((candidate) => candidate.streamId === streamId);
    if (!stream || stream.source !== "browser" || V().activeStreamId !== streamId || stream.ownerPeerId !== screenShareLocalPeerId()) return;
    closeScreenSharePeer(peerId);
    const peer = createScreenSharePeer(streamId, peerId, "owner");
    try {
      const offer = await peer.createOffer();
      if (!isCurrentPeer(peerId, peer)) return;
      await peer.setLocalDescription({ type: offer.type, sdp: declareStereoOpusOffer(offer.sdp ?? "") });
      if (!isCurrentPeer(peerId, peer)) return;
      armScreenSharePeerTimer(peerId);
      sendScreenShareMessage({
        type: "screenShareSignal",
        streamId,
        targetPeerId: peerId,
        signal: { kind: "offer", sdp: peer.localDescription?.sdp ?? offer.sdp ?? "" },
      });
    } catch {
      if (isCurrentPeer(peerId, peer)) failScreenSharePeer(peerId, "无法为 TeamSpeak 观看端创建屏幕共享直连");
    }
  }

  async function handleScreenShareSignal(streamId: string, fromPeerId: string, signal: ScreenShareSignal): Promise<void> {
    const stream = V().streams.find((candidate) => candidate.streamId === streamId);
    if (!stream) return;
    if (signal.kind === "close") {
      closeScreenSharePeer(fromPeerId);
      if (V().viewingStreamId === streamId) {
        store.setState({ viewing: false, viewingStreamId: "", remoteStream: null });
      }
      return;
    }
    if (signal.kind === "iceCandidate") {
      if (!signal.candidate) return;
      const peer = screenSharePeers.get(fromPeerId);
      const candidate: RTCIceCandidateInit = {
        candidate: signal.candidate,
        ...(signal.sdpMid !== undefined ? { sdpMid: signal.sdpMid } : {}),
        ...(signal.sdpMLineIndex !== undefined ? { sdpMLineIndex: signal.sdpMLineIndex } : {}),
      };
      if (!peer?.remoteDescription) {
        screenSharePendingIce.set(fromPeerId, [...(screenSharePendingIce.get(fromPeerId) ?? []), candidate]);
        return;
      }
      try { await peer.addIceCandidate(candidate); } catch { /* stale ICE is not fatal */ }
      return;
    }

    if (stream.source === "teamspeak" && V().viewingStreamId === streamId && fromPeerId === stream.ownerPeerId && signal.kind === "offer") {
      const peer = screenSharePeers.get(fromPeerId) ?? createScreenSharePeer(streamId, fromPeerId, "viewer");
      if (!signal.sdp) return;
      armScreenSharePeerTimer(fromPeerId);
      try {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        if (!isCurrentPeer(fromPeerId, peer)) return;
        await flushScreenShareCandidates(fromPeerId, peer);
        if (!isCurrentPeer(fromPeerId, peer)) return;
        const answer = await peer.createAnswer();
        if (!isCurrentPeer(fromPeerId, peer)) return;
        await peer.setLocalDescription(answer);
        if (!isCurrentPeer(fromPeerId, peer)) return;
        sendScreenShareMessage({ type: "screenShareSignal", streamId, targetPeerId: fromPeerId, signal: { kind: "answer", sdp: answer.sdp ?? "" } });
      } catch {
        if (isCurrentPeer(fromPeerId, peer)) failScreenSharePeer(fromPeerId, "无法回复 TeamSpeak 屏幕共享的直连请求");
      }
      return;
    }

    if (stream.source === "browser" && V().activeStreamId === streamId && stream.ownerPeerId === screenShareLocalPeerId() && fromPeerId.startsWith("ts-viewer-") && signal.kind === "answer") {
      const peer = screenSharePeers.get(fromPeerId);
      if (!peer || !signal.sdp) return;
      try {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        if (!isCurrentPeer(fromPeerId, peer)) return;
        await flushScreenShareCandidates(fromPeerId, peer);
        if (!isCurrentPeer(fromPeerId, peer)) return;
      } catch {
        if (isCurrentPeer(fromPeerId, peer)) failScreenSharePeer(fromPeerId, "TeamSpeak 观看端无法完成屏幕共享直连协商");
      }
      return;
    }

    if (stream.source === "browser" && stream.ownerPeerId === fromPeerId && signal.kind === "answer") {
      const peer = screenSharePeers.get(fromPeerId);
      if (!peer || !signal.sdp) return;
      try {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        if (!isCurrentPeer(fromPeerId, peer)) return;
        await flushScreenShareCandidates(fromPeerId, peer);
        if (!isCurrentPeer(fromPeerId, peer)) return;
      } catch {
        if (isCurrentPeer(fromPeerId, peer)) failScreenSharePeer(fromPeerId, "观看端无法完成屏幕共享直连协商");
      }
      return;
    }

    if (V().activeStreamId === streamId && stream.ownerPeerId === screenShareLocalPeerId()) {
      const peer = screenSharePeers.get(fromPeerId) ?? createScreenSharePeer(streamId, fromPeerId, "owner");
      if (signal.kind !== "offer" || !signal.sdp) return;
      armScreenSharePeerTimer(fromPeerId);
      console.info(`[screen-share] 收到观看者 ${fromPeerId} 的连接请求，开始应答`);
      try {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        if (!isCurrentPeer(fromPeerId, peer)) return;
        await flushScreenShareCandidates(fromPeerId, peer);
        if (!isCurrentPeer(fromPeerId, peer)) return;
        const answer = await peer.createAnswer();
        if (!isCurrentPeer(fromPeerId, peer)) return;
        await peer.setLocalDescription(answer);
        if (!isCurrentPeer(fromPeerId, peer)) return;
        console.info(`[screen-share] 已向观看者 ${fromPeerId} 发送应答，等待 ICE 候选交换`);
        sendScreenShareMessage({ type: "screenShareSignal", streamId, targetPeerId: fromPeerId, signal: { kind: "answer", sdp: answer.sdp ?? "" } });
      } catch {
        if (isCurrentPeer(fromPeerId, peer)) failScreenSharePeer(fromPeerId, "共享端无法完成观看者的直连协商");
      }
    }
  }

  // The owner peer id is generated by the gateway and is returned in the
  // screenShareStarted event; the active stream's owner id is therefore the
  // only stable local-owner marker available to the browser.
  function screenShareLocalPeerId(): string {
    const active = V().streams.find((stream) => stream.streamId === V().activeStreamId);
    return active?.ownerPeerId ?? "";
  }

  async function startScreenShare(audio = true, settings?: ScreenShareOutputSettings): Promise<void> {
    if (!transport.isOpen() || V().active || V().starting) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      store.setState({ error: "当前浏览器不支持屏幕共享" });
      return;
    }
    store.setState({ errorCode: "", error: "" });
    const startGeneration = ++screenShareStartGeneration;
    store.setState({ starting: true });
    screenShareStartCancelled = false;
    screenShareOutputSettings = settings ?? null;
    let acquiredStream: MediaStream | null = null;
    try {
      // getDisplayMedia must stay the first await on the trusted-click path:
      // transient user activation does not survive intermediate async work, so
      // anything awaited before this call would make the picker throw
      // "Invalid state" / require a second gesture. Keep it first-hop.
      const stream = acquiredStream = await navigator.mediaDevices.getDisplayMedia({
        // Capture the selected surface at its native browser-provided size.
        // Output resolution/FPS are applied later on each RTCRtpSender so the
        // user's desktop or application window is never resized or sampled at
        // the output limit.
        video: true,
        // Shared audio is MUSIC, not speech: Chromium applies its voice DSP
        // (EC/NS/AGC) by default on display capture unless every processing
        // knob is explicitly off — the accompaniment pattern.
        audio: audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false } : false,
        // These are preferences: when the selected surface is a window, ask
        // for that window's audio; when it is a monitor, allow system audio.
        // The browser/OS may still return no audio or ignore the preference.
        systemAudio: "include",
        windowAudio: "window",
        selfBrowserSurface: "exclude",
      } as unknown as DisplayMediaStreamOptions);
      if (startGeneration !== screenShareStartGeneration || !V().starting || screenShareStartCancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("NO_VIDEO_TRACK");
      const displaySurface = videoTrack.getSettings().displaySurface;
      if ("contentHint" in videoTrack) videoTrack.contentHint = displaySurface === "browser" ? "detail" : "motion";
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && "contentHint" in audioTrack) {
        try { audioTrack.contentHint = "music"; } catch { /* optional per-track hint */ }
      }
      screenShareLocalStream = stream;
      screenShareRequestSequence = (screenShareRequestSequence + 1) % 1_000_000;
      screenSharePendingStartId = `screen-start-${screenShareRequestSequence}`;
      for (const track of stream.getTracks()) track.addEventListener("ended", () => {
        if (screenShareLocalStream === stream) stopScreenShare();
      }, { once: true });
      sendScreenShareMessage({ type: "screenShareStart", requestId: screenSharePendingStartId, audio: stream.getAudioTracks().length > 0, name: "我的屏幕" });
    } catch (error: unknown) {
      acquiredStream?.getTracks().forEach(track => track.stop());
      if (startGeneration !== screenShareStartGeneration) return;
      screenShareLocalStream = null;
      screenShareOutputSettings = null;
      store.setState({ starting: false });
      screenSharePendingStartId = "";
      screenShareStartCancelled = false;
      if (error instanceof DOMException && error.name === "NotAllowedError") store.setState({ error: "你取消了屏幕共享或浏览器未授予权限" });
      else store.setState({ error: "无法开始屏幕共享，请检查浏览器权限" });
    }
  }

  function stopScreenShare(): void {
    screenShareStartGeneration += 1;
    if (V().starting) screenShareStartCancelled = true;
    if (V().active && V().activeStreamId) sendScreenShareMessage({ type: "screenShareStop", streamId: V().activeStreamId });
    closeAllScreenSharePeers();
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
    store.setState({ starting: false, active: false, activeStreamId: "" });
    screenSharePendingStartId = "";
    screenShareStartCancelled = false;
  }

  function joinScreenShare(streamId: string): void {
    store.setState({ errorCode: "", error: "" });
    if (V().viewingStreamId && V().viewingStreamId !== streamId) leaveScreenShare();
    screenShareRequestSequence = (screenShareRequestSequence + 1) % 1_000_000;
    sendScreenShareMessage({ type: "screenShareJoin", streamId, requestId: `screen-join-${screenShareRequestSequence}` });
  }

  function leaveScreenShare(): void {
    if (V().viewingStreamId) sendScreenShareMessage({ type: "screenShareLeave", streamId: V().viewingStreamId });
    closeAllScreenSharePeers();
    store.setState({ viewing: false, viewingStreamId: "", remoteStream: null });
  }

  function stopScreenShareTransport(sendStop: boolean): void {
    screenShareStartGeneration += 1;
    if (sendStop && V().active && V().activeStreamId) sendScreenShareMessage({ type: "screenShareStop", streamId: V().activeStreamId });
    if (V().starting) screenShareStartCancelled = true;
    closeAllScreenSharePeers();
    screenShareLocalStream?.getTracks().forEach((track) => track.stop());
    screenShareLocalStream = null;
    screenShareOutputSettings = null;
    store.setState({
      starting: false, active: false, activeStreamId: "",
      viewing: false, viewingStreamId: "", remoteStream: null, streams: [],
    });
    screenSharePendingStartId = "";
    screenShareStartCancelled = false;
  }

  function removeStream(streamId: string): void {
    const streams = V().streams;
    if (!streams.some((candidate) => candidate.streamId === streamId)) return;
    store.setState({ streams: streams.filter((candidate) => candidate.streamId !== streamId) });
  }

  function upsertScreenShareStream(raw: unknown): ScreenShareStream | null {
    const stream = parseScreenShareStream(raw);
    if (!stream) return null;
    const streams = V().streams;
    const index = streams.findIndex((candidate) => candidate.streamId === stream.streamId);
    const next = [...streams];
    if (index >= 0) next[index] = stream;
    else next.push(stream);
    store.setState({ streams: next });
    return stream;
  }

  function handleMessage(msg: ServerMessage): boolean {
    switch (msg.type) {
      case "screenShareList": {
        const streams: ScreenShareStream[] = [];
        if (Array.isArray(msg.streams)) {
          for (const raw of msg.streams) {
            const stream = parseScreenShareStream(raw);
            if (stream) streams.push(stream);
          }
        }
        store.setState({ streams });
        break;
      }
      case "screenShareStarted": {
        const stream = upsertScreenShareStream(msg.stream);
        if (!stream) break;
        if (msg.owner === true) {
          const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
          const isCurrentStart = Boolean(screenSharePendingStartId) && requestId === screenSharePendingStartId && !screenShareStartCancelled;
        if (!isCurrentStart) {
          // An acknowledgement for the stream we are already sharing is a late
          // duplicate, not a ghost: reposting screenShareStop from here once
          // tore down a healthy broadcast for every viewer.
          if (V().activeStreamId === stream.streamId) {
            screenSharePendingStartId = "";
            store.setState({ starting: false, active: true });
            break;
          }
          sendScreenShareMessage({ type: "screenShareStop", streamId: stream.streamId });
          removeStream(stream.streamId);
          break;
        }
          screenSharePendingStartId = "";
          store.setState({ starting: false, active: true, activeStreamId: stream.streamId });
        }
        break;
      }
      case "screenShareViewerCount": {
        const streamId = String(msg.streamId || "");
        const index = V().streams.findIndex((candidate) => candidate.streamId === streamId);
        if (index >= 0) {
          const current = V().streams[index]!;
          const patched = { ...current };
          if (typeof msg.viewerCount === "number") patched.viewerCount = Math.max(0, Math.floor(msg.viewerCount));
          if (Array.isArray(msg.viewers)) patched.viewers = parseScreenShareViewers(msg.viewers);
          const next = [...V().streams];
          next[index] = patched;
          store.setState({ streams: next });
        }
        break;
      }
      case "screenShareStopped": {
        const streamId = String(msg.streamId || "");
        removeStream(streamId);
        if (V().activeStreamId === streamId) {
          closeAllScreenSharePeers();
          screenSharePendingStartId = "";
          screenShareStartCancelled = false;
          screenShareLocalStream?.getTracks().forEach((track) => track.stop());
          screenShareLocalStream = null;
          screenShareOutputSettings = null;
          store.setState({ starting: false, active: false, activeStreamId: "" });
        }
        if (V().viewingStreamId === streamId) {
          closeAllSharePeersAndViewing();
        }
        break;
      }
      case "screenShareJoined": {
        const stream = upsertScreenShareStream(msg.stream);
        if (!stream) break;
        void startScreenShareViewer(stream);
        break;
      }
      case "screenShareNativeViewerJoined":
        if (typeof msg.streamId === "string" && typeof msg.viewerPeerId === "string") {
          void startNativeScreenShareViewer(msg.streamId, msg.viewerPeerId);
        }
        break;
      case "screenShareSignal":
        if (typeof msg.streamId === "string" && typeof msg.fromPeerId === "string" && msg.signal) {
          void handleScreenShareSignal(msg.streamId, msg.fromPeerId, msg.signal as ScreenShareSignal);
        }
        break;
      case "screenShareViewerLeft":
        if (typeof msg.viewerPeerId === "string") closeScreenSharePeer(msg.viewerPeerId);
        break;
      case "screenShareLeft":
        if (V().viewingStreamId === String(msg.streamId || "")) leaveScreenShare();
        break;
      case "screenShareError": {
        const patch: Partial<ScreenShareView> = {
          errorCode: typeof msg.code === "string" ? msg.code : "",
          error: String(msg.message || "屏幕共享操作失败"),
        };
        store.setState(patch);
        if (V().starting) {
          // Only a rejection of the start request itself may abort a pending
          // start. Any other error used to clear the pending start id, so a
          // late screenShareStarted then failed the currency check and the
          // stale-start guard reposted screenShareStop — killing the broadcast
          // server-side while the capture was already gone.
          const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
          if (requestId && requestId === screenSharePendingStartId) {
            screenSharePendingStartId = "";
            screenShareStartCancelled = false;
            screenShareLocalStream?.getTracks().forEach((track) => track.stop());
            screenShareLocalStream = null;
            screenShareOutputSettings = null;
            store.setState({ starting: false });
          }
        }
        if (V().viewing) {
          if (V().viewingStreamId) sendScreenShareMessage({ type: "screenShareLeave", streamId: V().viewingStreamId });
          closeAllSharePeersAndViewing();
        }
        break;
      }
      default: return false;
    }
    return true;
  }

  function closeAllSharePeersAndViewing(): void {
    closeAllScreenSharePeers();
    store.setState({ viewing: false, viewingStreamId: "", remoteStream: null });
  }

  return {
    store,
    /** WebRTC 诊断快照 store（每秒采样，见 screen-share-stats.ts）。 */
    statsStore: screenShareStats.store,
    handleMessage,
    startScreenShare,
    stopScreenShare,
    joinScreenShare,
    leaveScreenShare,
    setRemoteVolume(volume: number): void {
      store.setState({ remoteVolume: volume });
    },
    setIceServers(servers?: ScreenShareIceServer[]): void {
      screenShareIceServers = normalizeScreenShareIceServers(servers);
    },
    refreshStreams(): void { sendScreenShareMessage({ type: "screenShareList" }); },
    stopTransport: stopScreenShareTransport,
  };
}
