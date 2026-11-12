/**
 * Opus packet framing per RFC 6716. The TeamSpeak adapter hands over raw Opus
 * payloads without timing metadata, so forwarding them as RTP requires parsing
 * the table-of-contents byte to know how far the RTP timestamp must advance —
 * an incorrect step makes the receiver's jitter buffer play the stream at the
 * wrong speed or discard packets.
 */

// Duration in milliseconds of a single frame, indexed by the TOC config
// (the top five bits): SILK modes span 10-60 ms, hybrid modes 10-20 ms and
// CELT modes 2.5-20 ms.
const MAX_PACKET_DURATION_MS = 120;

const FRAME_DURATION_MS = [
  10, 20, 40, 60, // SILK NB
  10, 20, 40, 60, // SILK MB
  10, 20, 40, 60, // SILK WB
  10, 20, // Hybrid WB
  10, 20, // Hybrid FB
  2.5, 5, 10, 20, // CELT NB
  2.5, 5, 10, 20, // CELT WB
  2.5, 5, 10, 20, // CELT SWB
  2.5, 5, 10, 20, // CELT FB
];

function opusFrameCount(toc: number, payload: Uint8Array): number | null {
  const code = toc & 0x03;
  if (code === 0) return payload.length >= 2 ? 1 : null;
  if (code === 1) return payload.length >= 3 ? 2 : null;
  if (code === 2) {
    // Two frames of unequal size; the first carries a 1-2 byte length prefix
    // and must itself be non-empty.
    return payload.length >= 3 && payload[1]! > 0 ? 2 : null;
  }
  // Code 3 (RFC 6716 §3.2.5): the frame count always lives in the six low
  // bits of the second byte (M, 1..48). Bit 6 is the Opus padding flag and
  // bit 7 the VBR flag — there is no "extended frame count" byte. Padding
  // length bytes and the padding itself follow the frame count byte and come
  // out of the same budget, so they never take part in the timing.
  if (payload.length < 2) return null;
  const count = payload[1]! & 0x3f;
  // Every declared frame needs at least one compressed byte; padding only
  // removes bytes from the tail, so this necessary bound holds in both the
  // CBR and VBR layouts. An implausible count would poison the RTP timeline
  // more than dropping the packet does.
  return count > 0 && count <= 48 && payload.length - 2 >= count ? count : null;
}

/** Total play duration of an Opus packet in milliseconds, or null when the
 *  packet is not parseable (which includes an empty payload). */
export function opusFrameDurationMs(payload: Uint8Array): number | null {
  if (payload.length === 0) return null;
  const toc = payload[0]!;
  const frames = opusFrameCount(toc, payload);
  if (frames === null) return null;
  const duration = FRAME_DURATION_MS[toc >> 3] * frames;
  // RFC 6716 §3.2.5: the audio duration in one packet MUST NOT exceed 120 ms.
  // A larger jump would desynchronize the receiver's jitter buffer.
  return duration > MAX_PACKET_DURATION_MS ? null : duration;
}
