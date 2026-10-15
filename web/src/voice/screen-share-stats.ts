import { createStore } from "zustand/vanilla";

export interface ScreenShareCaptureStats {
  width: number | null;
  height: number | null;
  frameRate: number | null;
}

export interface ScreenSharePeerStats {
  peerId: string;
  role: "owner" | "viewer";
  direction: "outbound" | "inbound";
  connectionState: string;
  iceConnectionState: string;
  codec: string | null;
  candidateType: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  bitrateKbps: number | null;
  packetsLost: number | null;
  packetsTotal: number | null;
  lossPercent: number | null;
  framesDropped: number | null;
  jitterMs: number | null;
  roundTripTimeMs: number | null;
  availableOutgoingBitrateKbps: number | null;
  qualityLimitationReason: string | null;
}

export interface ScreenShareWebRtcStats {
  updatedAt: number | null;
  capture: ScreenShareCaptureStats | null;
  peers: ScreenSharePeerStats[];
}

type ScreenShareStatsRecord = Record<string, unknown>;

export interface ScreenShareStatsDeps {
  /** The controller's local capture track, when a capture is live. */
  getLocalVideoTrack: () => MediaStreamTrack | undefined;
  getPeers: () => Map<string, RTCPeerConnection>;
  getPeerRoles: () => Map<string, "owner" | "viewer">;
  isCurrentPeer: (peerId: string, peer: RTCPeerConnection) => boolean;
}

/** One-second WebRTC stats polling for the screen-share diagnostics panel:
 *  per-peer media/candidate parsing plus capture-track geometry, with a
 *  generation guard so a stopped poll can never publish a late sample. */
export function createScreenShareStats(deps: ScreenShareStatsDeps) {
  const store = createStore<ScreenShareWebRtcStats>(() => ({ updatedAt: null, capture: null, peers: [] }));
  const previous = new Map<string, { sampledAt: number; bytes: number | null; frames: number | null }>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let collecting = false;
  let generation = 0;

  function screenShareStatsRecord(value: unknown): ScreenShareStatsRecord {
    return value && typeof value === "object" ? value as ScreenShareStatsRecord : {};
  }

  function screenShareStatsNumber(statsRecord: ScreenShareStatsRecord | undefined, key: string): number | null {
    const value = statsRecord?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function screenShareStatsString(statsRecord: ScreenShareStatsRecord | undefined, key: string): string | null {
    const value = statsRecord?.[key];
    return typeof value === "string" && value ? value : null;
  }

  function screenShareVideoStatsKind(statsRecord: ScreenShareStatsRecord): string {
    return screenShareStatsString(statsRecord, "kind") ?? screenShareStatsString(statsRecord, "mediaType") ?? "";
  }

  function captureStats(): ScreenShareCaptureStats | null {
    const track = deps.getLocalVideoTrack();
    if (!track) return null;
    const settings = track.getSettings();
    return {
      width: typeof settings.width === "number" ? settings.width : null,
      height: typeof settings.height === "number" ? settings.height : null,
      frameRate: typeof settings.frameRate === "number" ? settings.frameRate : null,
    };
  }

  async function collectPeerStats(peerId: string, peer: RTCPeerConnection, role: "owner" | "viewer"): Promise<ScreenSharePeerStats | null> {
    try {
      const report = await peer.getStats();
      if (!deps.isCurrentPeer(peerId, peer)) return null;
      const records = new Map<string, ScreenShareStatsRecord>();
      let mediaStats: ScreenShareStatsRecord | undefined;
      let remoteInboundStats: ScreenShareStatsRecord | undefined;
      let trackStats: ScreenShareStatsRecord | undefined;
      let candidatePairStats: ScreenShareStatsRecord | undefined;
      report.forEach((raw) => {
        const statsRecord = screenShareStatsRecord(raw);
        const id = screenShareStatsString(statsRecord, "id");
        if (id) records.set(id, statsRecord);
        const type = screenShareStatsString(statsRecord, "type");
        const kind = screenShareVideoStatsKind(statsRecord);
        if (type === "outbound-rtp" && kind === "video" && role === "owner") mediaStats = statsRecord;
        if (type === "inbound-rtp" && kind === "video" && role === "viewer") mediaStats = statsRecord;
        if (type === "remote-inbound-rtp" && kind === "video" && role === "owner") remoteInboundStats = statsRecord;
        if (type === "track" && kind === "video") trackStats = statsRecord;
        if (type === "candidate-pair" && (statsRecord.selected === true || statsRecord.nominated === true || screenShareStatsString(statsRecord, "state") === "succeeded")) candidatePairStats = statsRecord;
      });

      const codecId = screenShareStatsString(mediaStats, "codecId");
      const codecStats = codecId ? records.get(codecId) : undefined;
      const localCandidateId = screenShareStatsString(candidatePairStats, "localCandidateId");
      const localCandidate = localCandidateId ? records.get(localCandidateId) : undefined;
      const remoteCandidateId = screenShareStatsString(candidatePairStats, "remoteCandidateId");
      const remoteCandidate = remoteCandidateId ? records.get(remoteCandidateId) : undefined;
      const remoteStats = role === "owner" ? remoteInboundStats : undefined;
      const frames = screenShareStatsNumber(mediaStats, role === "owner" ? "framesEncoded" : "framesDecoded")
        ?? screenShareStatsNumber(mediaStats, role === "owner" ? "framesSent" : "framesReceived");
      const bytes = screenShareStatsNumber(mediaStats, role === "owner" ? "bytesSent" : "bytesReceived");
      const now = performance.now();
      const sampled = previous.get(peerId);
      const elapsedMs = sampled ? now - sampled.sampledAt : 0;
      const derivedFrameRate = sampled && elapsedMs >= 250 && frames !== null && sampled.frames !== null
        ? Math.max(0, ((frames - sampled.frames) * 1_000) / elapsedMs)
        : null;
      const derivedBitrateKbps = sampled && elapsedMs >= 250 && bytes !== null && sampled.bytes !== null
        ? Math.max(0, ((bytes - sampled.bytes) * 8) / elapsedMs)
        : null;
      previous.set(peerId, { sampledAt: now, bytes, frames });

      const packetsLost = screenShareStatsNumber(remoteStats ?? mediaStats, "packetsLost");
      const packetsTransferred = screenShareStatsNumber(mediaStats, role === "owner" ? "packetsSent" : "packetsReceived");
      const packetsTotal = packetsTransferred === null || packetsLost === null ? null : packetsTransferred + packetsLost;
      const lossPercent = packetsTotal && packetsTotal > 0 && packetsLost !== null ? (packetsLost / packetsTotal) * 100 : null;
      const currentRoundTripTime = screenShareStatsNumber(remoteStats, "roundTripTime") ?? screenShareStatsNumber(candidatePairStats, "currentRoundTripTime");
      const jitter = screenShareStatsNumber(remoteStats ?? mediaStats, "jitter");
      const directFrameRate = screenShareStatsNumber(mediaStats, "framesPerSecond") ?? screenShareStatsNumber(trackStats, "framesPerSecond");
      const directBitrateKbps = screenShareStatsNumber(mediaStats, "bitrate") !== null ? (screenShareStatsNumber(mediaStats, "bitrate") as number) / 1_000 : null;
      return {
        peerId,
        role,
        direction: role === "owner" ? "outbound" : "inbound",
        connectionState: peer.connectionState,
        iceConnectionState: peer.iceConnectionState,
        codec: screenShareStatsString(codecStats, "mimeType"),
        candidateType: screenShareStatsString(localCandidate, "candidateType") ?? screenShareStatsString(remoteCandidate, "candidateType"),
        width: screenShareStatsNumber(mediaStats, "frameWidth") ?? screenShareStatsNumber(trackStats, "frameWidth"),
        height: screenShareStatsNumber(mediaStats, "frameHeight") ?? screenShareStatsNumber(trackStats, "frameHeight"),
        frameRate: directFrameRate !== null && directFrameRate > 0 ? directFrameRate : derivedFrameRate,
        bitrateKbps: directBitrateKbps ?? derivedBitrateKbps,
        packetsLost,
        packetsTotal,
        lossPercent,
        framesDropped: screenShareStatsNumber(mediaStats, "framesDropped") ?? screenShareStatsNumber(trackStats, "framesDropped"),
        jitterMs: jitter === null ? null : jitter * 1_000,
        roundTripTimeMs: currentRoundTripTime === null ? null : currentRoundTripTime * 1_000,
        availableOutgoingBitrateKbps: screenShareStatsNumber(candidatePairStats, "availableOutgoingBitrate") === null
          ? null
          : (screenShareStatsNumber(candidatePairStats, "availableOutgoingBitrate") as number) / 1_000,
        qualityLimitationReason: screenShareStatsString(mediaStats, "qualityLimitationReason"),
      };
    } catch {
      return null;
    }
  }

  async function collect(): Promise<void> {
    if (collecting || !deps.getPeers().size) return;
    collecting = true;
    const sample = generation;
    try {
      const peers = await Promise.all([...deps.getPeers().entries()].map(async ([peerId, peer]) => {
        const role = deps.getPeerRoles().get(peerId) ?? "viewer";
        return collectPeerStats(peerId, peer, role);
      }));
      if (sample !== generation) return;
      store.setState({
        capture: captureStats(),
        peers: peers.filter((peerStats): peerStats is ScreenSharePeerStats => peerStats !== null),
        updatedAt: Date.now(),
      });
    } finally {
      if (sample === generation) collecting = false;
    }
  }

  function startPolling(): void {
    if (timer) return;
    void collect();
    timer = setInterval(() => { void collect(); }, 1_000);
  }

  function stopPolling(): void {
    generation++;
    collecting = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    previous.clear();
    store.setState({ updatedAt: null, capture: null, peers: [] });
  }

  function forgetPeer(peerId: string): void {
    previous.delete(peerId);
  }

  return { store, startPolling, stopPolling, forgetPeer };
}
