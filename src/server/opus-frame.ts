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
  // Code 3: a control byte carries an optional padding flag and the frame
  // count, either inline (six bits) or in a following byte.
  if (payload.length < 2) return null;
  const control = payload[1]!;
  const extended = (control & 0x40) !== 0;
  const count = extended
    ? (payload.length >= 3 ? payload[2]! : 0)
    : control & 0x3f;
  // Every declared frame needs its own data byte; an implausible count would
  // poison the RTP timeline more than dropping the packet would.
  const headerBytes = extended ? 3 : 2;
  return count > 0 && count <= 48 && payload.length - headerBytes >= count ? count : null;
}

/** Total play duration of an Opus packet in milliseconds, or null when the
 *  packet is not parseable (which includes an empty payload). */
export function opusFrameDurationMs(payload: Uint8Array): number | null {
  if (payload.length === 0) return null;
  const toc = payload[0]!;
  const frames = opusFrameCount(toc, payload);
  if (frames === null) return null;
  return FRAME_DURATION_MS[toc >> 3] * frames;
}
