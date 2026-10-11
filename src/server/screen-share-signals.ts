import { escapeTeamSpeakValue } from "../security/ts-escaping.js";
import type { ScreenSharePeerSignal } from "../shared/screen-share.js";

/** TeamSpeak signaling plumbing for native screen-share streams: command
 *  serialization plus the payload-to-browser-signal translation. Pure
 *  functions only — no coordinator state lives here. */

export function parseNumber(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function nativeViewerPeerId(clientId: number): string {
  return `ts-viewer-${clientId}`;
}

export function parseNativeViewerPeerId(peerId: string): number | undefined {
  const match = /^ts-viewer-(\d+)$/.exec(peerId);
  if (!match) return undefined;
  return parseNumber(match[1]);
}

export function buildTeamSpeakCommand(command: string, params: Record<string, string>): string {
  return [command, ...Object.entries(params).map(([key, value]) => `${key}=${escapeTeamSpeakValue(value)}`)].join(" ");
}

export function parseStreamSignalPayload(raw: string): { cmd: string; args: Record<string, unknown> } | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.cmd !== "string" || !isRecord(value.args)) return null;
    return { cmd: value.cmd, args: value.args };
  } catch {
    return null;
  }
}

export function toBrowserScreenSignal(payload: { cmd: string; args: Record<string, unknown> }): ScreenSharePeerSignal | null {
  const args = payload.args;
  // TeamSpeak's native screen-share source wraps the initial SDP in a
  // `joinResponse` message after it accepts a viewer's join request. The
  // browser-side protocol uses the regular offer shape, so normalize it here
  // before forwarding it. Without this mapping the native source can accept a
  // viewer while the browser waits forever for its first SDP.
  if (payload.cmd === "joinResponse") {
    const decision = args.decision;
    if (decision === false || decision === 0 || decision === "0") return { kind: "close" };
    const sdp = typeof args.offer === "string" ? args.offer : typeof args.sdp === "string" ? args.sdp : "";
    return sdp ? { kind: "offer", sdp } : null;
  }
  if (payload.cmd === "offer" || payload.cmd === "reconnectOffer") {
    const sdp = typeof args.offer === "string" ? args.offer : typeof args.sdp === "string" ? args.sdp : "";
    return sdp ? { kind: "offer", sdp } : null;
  }
  if (payload.cmd === "answer") {
    const sdp = typeof args.answer === "string" ? args.answer : typeof args.sdp === "string" ? args.sdp : "";
    return sdp ? { kind: "answer", sdp } : null;
  }
  if (payload.cmd === "iceCandidate") {
    const candidate = typeof args.sdp === "string" ? args.sdp : typeof args.candidate === "string" ? args.candidate : "";
    if (!candidate) return null;
    return {
      kind: "iceCandidate",
      candidate,
      ...(typeof args.mid === "string" ? { sdpMid: args.mid } : {}),
      ...(typeof args.mLine === "number" ? { sdpMLineIndex: args.mLine } : {}),
    };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
