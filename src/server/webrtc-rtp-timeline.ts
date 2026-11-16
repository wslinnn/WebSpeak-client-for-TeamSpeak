/** Downstream RTP timeline for one TeamSpeak speaker slot.
 *
 *  TeamSpeak hands over Opus payloads with its own 16-bit sender counter (VId,
 *  `seq` in the SDK event). Turning that into RTP framing is where audio
 *  quality is won or lost:
 *
 *  - the sequence must advance one per packet, the timestamp by the packet's
 *    real audio duration (parsed from the TOC);
 *  - a counter *gap* is lost audio: leave a hole so the receiver conceals it
 *    instead of playing the rest of the speech slightly fast;
 *  - a counter that goes backwards is a duplicate or a late arrival: forwarding
 *    it would repeat a syllable or move the audio back in time;
 *  - a counter that keeps going backwards is a restarted client, not
 *    reordering: rebase, or the member stays silent for the whole call.
 *
 *  Packets the gateway deliberately drops (comfort noise during a pause, the
 *  empty end-of-speech packet) consume counter values without carrying audio.
 *  They are recorded as a *silent span* and subtracted from the next gap, so a
 *  pause is never reported to the browser as packet loss.
 */

/** A sender-sequence jump larger than this is not packet loss (that would be a
 *  multi-second outage on a 50 Hz stream): the speaker's client restarted its
 *  counter. Rebase onto the new counter instead of emitting a huge gap. */
export const MAX_VID_GAP_FRAMES = 50;

/** A sender sequence that keeps counting backwards is not reordering either:
 *  after this many rejected frames the counter is rebased so a client that
 *  reset it can never silence itself for the rest of the call. */
export const VID_REBASE_AFTER_REJECTS = 10;

/** The timeline state a slot carries. */
export interface SlotTimeline {
  /** Last sender sequence relayed (null before the first keyed frame). */
  lastVid: number | null;
  /** Highest deliberately-skipped sender sequence seen. Unlike `lastVid` it is
   *  only used to shrink the next gap, never to advance the timeline. */
  silentVid: number | null;
  /** Which counter `silentVid` belongs to (whispers number separately). */
  silentWhisper: boolean | null;
  /** Which counter `lastVid` belongs to. */
  vidWhisper: boolean;
  /** Rejected frames since the last accepted one. */
  vidRejected: number;
  sequenceNumber: number;
  timestamp: number;
}

/** Signed 16-bit difference: never compare counter values with `<`, they wrap
 *  from 65535 to 0. */
export function vidDelta(to: number, from: number): number {
  return ((to - from) << 16) >> 16;
}

/** Records a skipped packet (comfort noise / end-of-speech) against the slot.
 *  Only a high-water mark above the speech already forwarded is kept: these
 *  packets share the UDP path with speech, so a late one must not drag anything
 *  back and an early one must not be mistaken for speech that already passed. */
export function noteSkippedPacket(timeline: SlotTimeline, vid: number, whisper: boolean): void {
  if (timeline.lastVid !== null && vidDelta(vid, timeline.lastVid) <= 0) return;
  if (timeline.silentWhisper !== null && timeline.silentWhisper !== whisper) timeline.silentVid = null;
  timeline.silentWhisper = whisper;
  if (timeline.silentVid === null || vidDelta(vid, timeline.silentVid) > 0) timeline.silentVid = vid;
}

export interface Placement {
  /** Sender sequence of this packet, or null when the event carries none
   *  (legacy SDK shape) and the arrival-order timeline stays in use. */
  vid: number | null;
  whisper: boolean;
  /** Another Opus frame of the packet already placed: shares its sequence. */
  continuation: boolean;
}

export type PlacementResult =
  | { accepted: true; advance: number }
  | { accepted: false };

/** Decides where the packet belongs and updates the baselines. `advance` is
 *  how many sender slots this packet is past the previous one (1 = contiguous,
 *  more = the receiver is told about missing audio). */
export function placeOnTimeline(timeline: SlotTimeline, placement: Placement): PlacementResult {
  const { vid, whisper, continuation } = placement;
  if (continuation) return { accepted: true, advance: 1 };
  if (vid === null) {
    // No sender sequence to key on: keep the arrival-order timeline.
    timeline.lastVid = null;
    timeline.silentVid = null;
    timeline.silentWhisper = null;
    timeline.vidRejected = 0;
    timeline.vidWhisper = whisper;
    return { accepted: true, advance: 1 };
  }
  let advance = 1;
  if (timeline.lastVid !== null && timeline.vidWhisper === whisper) {
    let delta = vidDelta(vid, timeline.lastVid);
    // Packets the gateway skipped consumed counter values without carrying
    // audio: subtract them so a pause is not reported as loss. What remains
    // really was lost.
    if (timeline.silentVid !== null && timeline.silentWhisper === whisper) {
      const silent = vidDelta(timeline.silentVid, timeline.lastVid);
      if (silent > 0 && silent <= MAX_VID_GAP_FRAMES) delta = Math.max(1, delta - silent);
    }
    if (delta <= 0) {
      // A repeat forwards the same syllable twice; a packet that arrived after
      // a later one would move the audio backwards. Either way the receiver
      // cannot use it.
      timeline.vidRejected += 1;
      if (timeline.vidRejected < VID_REBASE_AFTER_REJECTS) return { accepted: false };
      // Ten rejects in a row are not reordering but a restarted counter:
      // rebase so the member is heard again instead of dropped forever.
      timeline.vidRejected = 0;
      timeline.lastVid = vid;
      timeline.vidWhisper = whisper;
      timeline.silentVid = null;
      return { accepted: true, advance: 1 };
    }
    if (delta <= MAX_VID_GAP_FRAMES) advance = delta;
    // A larger jump is a counter restart, not loss: rebase (advance stays 1).
  }
  timeline.vidRejected = 0;
  timeline.silentVid = null;
  timeline.silentWhisper = null;
  timeline.lastVid = vid;
  timeline.vidWhisper = whisper;
  return { accepted: true, advance };
}

/** Opens the `advance - 1` empty slots before an accepted packet. The packet's
 *  own span is applied by the caller after it writes the header, so the header
 *  carries the timestamp of the packet's *first* sample (RFC 3550). */
export function openGap(timeline: SlotTimeline, advance: number, samples: number): void {
  if (advance <= 1) return;
  timeline.sequenceNumber = (timeline.sequenceNumber + (advance - 1)) & 0xffff;
  timeline.timestamp = (timeline.timestamp + (advance - 1) * samples) >>> 0;
}

/** Clears the sender-sequence state when the slot changes speakers. The RTP
 *  sequence/timestamp space deliberately survives: one SSRC has one continuous
 *  timeline (RFC 3550), and only the mark bit announces the new talk spurt. */
export function resetSenderBaseline(timeline: SlotTimeline): void {
  timeline.lastVid = null;
  timeline.silentVid = null;
  timeline.silentWhisper = null;
  timeline.vidRejected = 0;
}
