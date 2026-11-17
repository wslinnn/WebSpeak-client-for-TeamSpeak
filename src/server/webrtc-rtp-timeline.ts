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

/** How many skipped sequences are remembered *beyond* the running count, so a
 *  skipped packet that overtook the speech can still be recognised once the
 *  speech catches up. This bounds only the reordering window, never the length
 *  of a pause: a pause is counted, not enumerated. */
const MAX_TRACKED_SKIPS = 32;

/** The timeline state a slot carries. */
export interface SlotTimeline {
  /** Last sender sequence relayed (null before the first keyed frame). */
  lastVid: number | null;
  /** Skipped packets counted since the last accepted frame. A counter rather
   *  than a list: a pause may be arbitrarily long (comfort noise runs the whole
   *  time a member is silent), and enumerating it would either grow without
   *  bound or — with a cap — silently turn the tail of a long pause into fake
   *  packet loss. */
  skippedSinceAccept: number;
  /** Skipped sequences seen ahead of the speech baseline, so one that overtook
   *  the speech is not counted as a gap when the speech catches up. Bounded by
   *  MAX_TRACKED_SKIPS: this is a reordering window, not a pause. */
  skippedAhead: Set<number>;
  /** Which counter `skippedSinceAccept`/`skippedAhead` belong to (whispers
   *  number separately from the normal voice counter). */
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
    skippedSinceAccept: 0,
    skippedAhead: new Set(),
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
  if (timeline.silentWhisper !== null && timeline.silentWhisper !== whisper) {
    timeline.skippedAhead.clear();
    timeline.skippedSinceAccept = 0;
  }
  timeline.silentWhisper = whisper;
  timeline.skippedSinceAccept += 1;
  // A repeat of the same sequence is not a second skipped packet; the count is
  // per sequence value, so drop a duplicate before counting it twice.
  if (timeline.skippedAhead.has(vid)) {
    timeline.skippedSinceAccept -= 1;
    return;
  }
  timeline.skippedAhead.add(vid);
  if (timeline.skippedAhead.size > MAX_TRACKED_SKIPS) {
    // Forget the earliest by counter order: those belong to a stretch the
    // sender has since moved past, where the running count already covers them.
    const oldest = [...timeline.skippedAhead].reduce(
      (best, value) => (best === null || vidDelta(value, best) < 0 ? value : best),
      null as number | null,
    );
    if (oldest !== null) timeline.skippedAhead.delete(oldest);
  }
}

/** How many of the counted skips fall inside the gap `(from, to)`, and forgets
 *  the sequences the sender has now passed. At most `to - from - 1` packets can
 *  sit in the span (the span is the gap itself), so anything counted beyond it
 *  is a skip that overtook the speech and stays owed for a later gap. */
function takeSkipsInSpan(timeline: SlotTimeline, from: number, to: number, whisper: boolean): number {
  if (timeline.silentWhisper !== whisper) return 0;
  const span = vidDelta(to, from) - 1;
  // Skipped sequences the sender has now passed are covered by the counter, so
  // drop them from the reordering window.
  for (const skipped of timeline.skippedAhead) {
    if (vidDelta(skipped, to) <= 0) timeline.skippedAhead.delete(skipped);
  }
  if (timeline.skippedSinceAccept <= 0) return 0;
  const inside = Math.min(Math.max(0, span), timeline.skippedSinceAccept);
  timeline.skippedSinceAccept -= inside;
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
    timeline.skippedSinceAccept = 0;
    timeline.skippedAhead.clear();
    timeline.silentWhisper = null;
    timeline.vidRejected = 0;
    timeline.vidWhisper = whisper;
    return { accepted: true, advance: 1 };
  }
  let advance = 1;
  if (timeline.lastVid !== null && timeline.vidWhisper === whisper) {
    let delta = vidDelta(vid, timeline.lastVid);
    // Packets the gateway skipped consumed counter values without carrying
    // audio, so they must not be reported as loss. The count is bounded by the
    // gap itself: what fits inside it was skipped, and anything genuinely lost
    // in the same stretch still produces a hole for the receiver to conceal.
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
      timeline.skippedSinceAccept = 0;
      timeline.skippedAhead.clear();
      timeline.silentWhisper = null;
      return { accepted: true, advance: 1 };
    }
    if (delta <= MAX_VID_GAP_FRAMES) advance = delta;
    // A larger jump is a counter restart, not loss: rebase (advance stays 1).
  } else {
    // A counter-domain switch (or the first keyed frame): nothing tracked under
    // the other counter applies here.
    timeline.skippedSinceAccept = 0;
    timeline.skippedAhead.clear();
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
  timeline.skippedSinceAccept = 0;
  timeline.skippedAhead.clear();
  timeline.silentWhisper = null;
  timeline.vidRejected = 0;
}
