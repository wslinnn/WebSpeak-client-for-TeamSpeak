/**
 * Optional-byte handling for S2C voice payloads (33 号 D3/D14).
 *
 * The SDK hands over the bytes after `[VId][CId][codec]` together with the
 * packet's high-nibble flags. On voice/whisper packets:
 * - 0x10: one extension byte prefixes the audio. On Opus channels it is the
 *   voice-frame count (nvp) and the audio is nvp equal-length frames.
 * - 0x40: one trailer byte follows the audio — the sender's RTT deviation in
 *   milliseconds times three (official client, 36 号 R15).
 */

export const VOICE_FLAG_EXTENSION = 0x10;
export const VOICE_FLAG_TRAILER = 0x40;

export interface SplitVoicePayload {
  /** Audio frames in wire order; each is a view into the input buffer. */
  frames: Buffer[];
  /** Sender jitter in milliseconds from the trailer, or null when absent. */
  jitterMs: number | null;
}

/** Splits a voice payload into clean Opus frames, or null when malformed.
 *  The trailer is stripped first so a 3-byte comfort-noise frame plus its
 *  trailer cannot escape the downstream size filter as a 4-byte frame. */
export function splitVoicePayload(data: Buffer, flags: number): SplitVoicePayload | null {
  let payload = data;
  let jitterMs: number | null = null;
  if ((flags & VOICE_FLAG_TRAILER) !== 0) {
    if (payload.length === 0) return null;
    jitterMs = payload[payload.length - 1]! / 3;
    payload = payload.subarray(0, payload.length - 1);
  }
  if ((flags & VOICE_FLAG_EXTENSION) === 0) return { frames: [payload], jitterMs };
  if (payload.length === 0) return null;
  const frameCount = payload[0]!;
  const audio = payload.subarray(1);
  // A zero count is illegal and a non-divisible payload cannot be split into
  // equal frames; either way the packet is unparseable, never guess a split.
  if (frameCount === 0 || audio.length % frameCount !== 0) return null;
  const frameSize = audio.length / frameCount;
  const frames: Buffer[] = [];
  for (let index = 0; index < frameCount; index++) {
    frames.push(audio.subarray(index * frameSize, (index + 1) * frameSize));
  }
  return { frames, jitterMs };
}
