/** Browser-safe voice negotiation contract; screen sharing has its own signaling. */
export interface SessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface WebRtcSessionDescription extends SessionDescription {
  muted?: boolean;
  accompanimentActive?: boolean;
}

export type WebRtcClientMessage =
  | { type: "webrtcOffer"; payload: {
    sdp: SessionDescription & { type: "offer" };
    muted?: boolean;
    accompanimentActive?: boolean;
  } }
  | { type: "webrtcStop" };

export const MAX_VOICE_SDP_LENGTH = 256 * 1024;

/**
 * Voice uplink budget for the browser Opus encoder. TeamSpeak's quality 10
 * profile is advertised as ~7.71 KiB/s; 60 kbps of Opus payload fits inside
 * that budget with protocol overhead to spare, while 64 kbps does not and gets
 * packets trimmed server-side. Both the gateway (answer fmtp ceiling) and the
 * browser (RTCRtpSender target) must agree on this number: the fmtp value is
 * only a negotiated ceiling — without a matching sender target, Chrome keeps
 * encoding at its ~32 kbps default.
 */
export const WEBRTC_UPLINK_OPUS_MAX_BITRATE_BPS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSessionDescription<T extends SessionDescription["type"]>(value: unknown, type: T): value is SessionDescription & { type: T } {
  return isRecord(value) && value.type === type && typeof value.sdp === "string" && value.sdp.length <= MAX_VOICE_SDP_LENGTH;
}

/** Null preserves the gateway's existing fallback to ordinary command errors. */
export function parseWebRtcClientMessage(raw: string): WebRtcClientMessage | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value)) return null;
  // Older clients send no payload. Ignore extra fields as the old parser did.
  if (value.type === "webrtcStop") return { type: "webrtcStop" };
  if (value.type !== "webrtcOffer" || !isRecord(value.payload) || !isSessionDescription(value.payload.sdp, "offer")) return null;
  if (value.payload.muted !== undefined && typeof value.payload.muted !== "boolean") return null;
  if (value.payload.accompanimentActive !== undefined && typeof value.payload.accompanimentActive !== "boolean") return null;
  return { type: "webrtcOffer", payload: {
    sdp: { type: "offer", sdp: value.payload.sdp.sdp },
    muted: value.payload.muted === true,
    accompanimentActive: value.payload.accompanimentActive === true,
  } };
}
