import { SessionAudioTransport } from "./session-audio.js";
import { createAudioFlowStats } from "./audio-stats.js";
import type { ServerMessage } from "../shared/server-messages.js";
import type { TSVoiceData } from "./ts-client.js";

/** Shared fixture for the session-audio contract tests: one transport with
 *  recording stand-ins for the socket, the TeamSpeak client, the encoder and the
 *  uplink decoder. Lives beside the suite (not in it) so the test file stays
 *  within the repository's per-file line budget. */
export function fixture(uplinkDecoder?: () => { decode(frame: Buffer): Buffer }) {
  const state = { current: true, ready: true, now: 0, targets: null as number[] | null, disposed: 0,
    webRtcVoice: false,
    peer: null as { pushTeamSpeakVoice(data: TSVoiceData): void } | null };
  const audio = createAudioFlowStats();
  const packets: Buffer[] = [];
  const encoded: Buffer[] = [];
  const forwarded: Array<{ data: Buffer; codec: number; targets?: number[] }> = [];
  const notices: ServerMessage[] = [];
  const warnings: Array<Record<string, unknown>> = [];
  const closes: Array<{ code: number; reason: string }> = [];
  const socket = { readyState: 1 as 0 | 1 | 2 | 3, bufferedAmount: 0, send: (packet: Buffer) => { packets.push(packet); },
    close: (code: number, reason: string) => { closes.push({ code, reason }); } };
  const client = {
    sendVoice: (data: Buffer, codec: number) => { forwarded.push({ data, codec }); },
    sendWhisper: (data: Buffer, targets: number[], codec: number) => { forwarded.push({ data, codec, targets }); },
  };
  const encoder = {
    encode(frame: Buffer) { encoded.push(frame); state.now += 3; return Buffer.from([9, 8, 7]); },
    dispose() { state.disposed++; },
  };
  const encoderCreations = { count: 0 };
  const logger = {
    debug: () => {}, info: () => {}, error: () => {},
    warn: (objOrMessage: unknown) => { if (typeof objOrMessage === "object" && objOrMessage !== null) warnings.push(objOrMessage as Record<string, unknown>); },
    child: () => logger,
  };
  const transport = new SessionAudioTransport({
    audio, socket, client, logger, isCurrent: () => state.current, isReady: () => state.ready,
    selfId: () => 1, webRtcVoice: () => state.webRtcVoice, peer: () => state.peer, whisperTargets: () => state.targets,
    sendJson: message => { notices.push(message); },
  }, () => { encoderCreations.count += 1; return encoder; }, () => state.now, uplinkDecoder);
  // 载荷取现实尺寸（≥4 字节）：≤3 字节是舒适噪声帧，下行过滤器会拦（见下方专测）。
  const remote = (clientId = 513) => ({ clientId, codec: 4, data: Buffer.from([11, 12, 13, 14]) });
  return { transport, audio, state, socket, client, encoder, encoderCreations, packets, encoded, forwarded, notices, warnings, closes, remote };
}
