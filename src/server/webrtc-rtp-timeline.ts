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

/** Upper bound on the skipped-sequence set. Skipped packets only matter until
 *  the next accepted frame consumes them, and a gap never exceeds
 *  MAX_VID_GAP_FRAMES, so this is decades of slack; the bound exists so a
 *  hostile or broken sender cannot grow the set without limit. */
const MAX_TRACKED_SKIPS = 128;

/** The timeline state a slot carries. */
export interface SlotTimeline {
  /** Last sender sequence relayed (null before the first keyed frame). */
  lastVid: number | null;
  /** Sender sequences the gateway deliberately skipped (comfort noise, the
   *  empty end-of-speech packet), as a set rather than a high-water mark: only
   *  those exact values are known to carry no audio. A real frame lost *inside*
   *  a paused stretch therefore still shows up as loss, and a skipped packet
   *  that overtakes speech is not mistaken for one the timeline still owes. */
  skippedVids: Set<number>;
  /** Which counter the skipped set belongs to (whispers number separately). */
  silentWhisper: boolean | null;
  /** Which counter `lastVid` belongs to. */
  vidWhisper: boolean;
  /** Rejected frames since the last accepted one. */
  vidRejected: number;
  sequenceNumber: number;
  timestamp: number;
}

/** A fresh timeline: RTP sequence/timestamp start at the caller's random draw
 *  (RFC 3550 §5.1) and no sender counter has been seen yet. */
export function createTimeline(sequenceNumber = 0, timestamp = 0): SlotTimeline {
  return {
    lastVid: null,
    skippedVids: new Set(),
    silentWhisper: null,
    vidWhisper: false,
    vidRejected: 0,
    sequenceNumber,
    timestamp,
  };
}

/** Signed 16-bit difference: never compare counter values with `<`, they wrap
 *  from 65535 to 0. */
export function vidDelta(to: number, from: number): number {
  return ((to - from) << 16) >> 16;
}

/** Records a skipped packet (comfort noise / end-of-speech) against the slot.
 *  Packets at or behind the speech already forwarded are dropped: these share
 *  the UDP path with speech, and a reordered leftover must not change what the
 *  timeline owes. */
export function noteSkippedPacket(timeline: SlotTimeline, vid: number, whisper: boolean): void {
  if (timeline.lastVid !== null && vidDelta(vid, timeline.lastVid) <= 0) return;
  if (timeline.silentWhisper !== null && timeline.silentWhisper !== whisper) timeline.skippedVids.clear();
  timeline.silentWhisper = whisper;
  timeline.skippedVids.add(vid);
  if (timeline.skippedVids.size > MAX_TRACKED_SKIPS) {
    // Forget the oldest entries: recompute the earliest by counter order rather
    // than insertion order, since arrivals are not ordered.
    const oldest = [...timeline.skippedVids].reduce((best, value) => (best === null || vidDelta(value, best) < 0 ? value : best), null as number | null);
    if (oldest !== null) timeline.skippedVids.delete(oldest);
  }
}

/** Drops every skipped sequence the accepted packet has now accounted for, and
 *  returns how many of them sat between the previous baseline and it. Only
 *  values strictly inside the span between `lastVid` and `vid` count: one the
 *  sender has since passed is not part of this gap. */
function takeSkipsInSpan(timeline: SlotTimeline, from: number, to: number, whisper: boolean): number {
  if (timeline.silentWhisper !== whisper || timeline.skippedVids.size === 0) return 0;
  let inside = 0;
  for (const skipped of timeline.skippedVids) {
    const offset = vidDelta(skipped, from);
    if (offset > 0 && offset < vidDelta(to, from)) inside += 1;
    // Reached or passed by the sender: the timeline will never owe it again.
    if (vidDelta(skipped, to) <= 0) timeline.skippedVids.delete(skipped);
  }
  return inside;
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
    timeline.skippedVids.clear();
    timeline.silentWhisper = null;
    timeline.vidRejected = 0;
    timeline.vidWhisper = whisper;
    return { accepted: true, advance: 1 };
  }
  let advance = 1;
  if (timeline.lastVid !== null && timeline.vidWhisper === whisper) {
    let delta = vidDelta(vid, timeline.lastVid);
    // Packets the gateway skipped consumed counter values without carrying
    // audio, so they must not be reported as loss. Only the exact skipped
    // values are discounted: a frame genuinely lost inside the same stretch
    // still produces a hole, which is what the receiver needs to conceal.
    const skipped = takeSkipsInSpan(timeline, timeline.lastVid, vid, whisper);
    if (skipped > 0) delta = Math.max(1, delta - skipped);
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
      timeline.skippedVids.clear();
      timeline.silentWhisper = null;
      return { accepted: true, advance: 1 };
    }
    if (delta <= MAX_VID_GAP_FRAMES) advance = delta;
    // A larger jump is a counter restart, not loss: rebase (advance stays 1).
  } else {
    // A counter-domain switch (or the first keyed frame): nothing tracked under
    // the other counter applies here.
    timeline.skippedVids.clear();
    timeline.silentWhisper = null;
  }
  timeline.vidRejected = 0;
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
  timeline.skippedVids.clear();
  timeline.silentWhisper = null;
  timeline.vidRejected = 0;
}
