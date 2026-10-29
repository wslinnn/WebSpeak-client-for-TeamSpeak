/** Screen-share SDP helpers. Screen-share audio is pure P2P (no TeamSpeak
 *  quality budget applies), so the receive/send capabilities can declare the
 *  full Opus range — the accompaniment pattern: Chromium caps a sender at the
 *  negotiated fmtp, and an omitted fmtp is NOT unlimited (RFC 7587: libwebrtc
 *  falls back to ~32 kbps defaults when neither side declares). */

/** fmtp additions for Opus m-lines we offer: stereo + high bitrate ceiling. */
const OPUS_SHARE_FMTP = "stereo=1;maxaveragebitrate=510000";

export function declareStereoOpusOffer(sdp: string): string {
  if (!sdp) return sdp;
  // The fmtp line itself does not name the codec: the payload type's rtpmap
  // does. Collect Opus payload types first, then augment only their fmtp
  // lines; without an identifiable rtpmap nothing is touched.
  const lines = sdp.split(/\r\n|\r|\n/);
  const opusPayloadTypes = new Set<string>();
  for (const line of lines) {
    const rtpmap = /^a=rtpmap:(\d+)\s+opus\//i.exec(line);
    if (rtpmap) opusPayloadTypes.add(rtpmap[1]!);
  }
  if (!opusPayloadTypes.size) return sdp;
  return lines.map((line) => {
    const match = /^a=fmtp:(\d+)\s(.+)$/.exec(line);
    if (!match || !opusPayloadTypes.has(match[1]!)) return line;
    if (/stereo=/.test(match[2]!)) return line;
    return `a=fmtp:${match[1]!} ${match[2]!};${OPUS_SHARE_FMTP}`;
  }).join("\r\n");
}
