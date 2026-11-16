/** Speaking detection for the WebRTC downstream slots.
 *
 *  Two sources feed one badge timeline:
 *
 *  - `receiver.getSynchronizationSources()` — synchronous, no statistics round
 *    trip. Its `timestamp` is an **epoch** value on Chromium (measured
 *    2026-11-16: `performance.timeOrigin + performance.now()`, within ~25 ms of
 *    `Date.now()`), not the `performance.now()` relative clock the spec wording
 *    suggests, and the entry survives ~10 s after the last packet. Comparing it
 *    against `performance.now()` therefore reads every packet as "just now" and
 *    keeps a member lit for ten seconds after they stop talking.
 *  - `receiver.getStats()` — the fallback for browsers without that API, via the
 *    growing `packetsReceived` counter.
 *
 *  A hidden tab skips the whole sweep: badges are invisible there, and the
 *  statistics report is a cross-thread snapshot per slot.
 */

/** The per-slot reception state the monitor reads and updates. */
export interface ActivitySlot {
  receiver: RTCRtpReceiver | null;
  clientId: number;
  active: boolean;
  /** `Date.now()` of the last packet attributed to this slot. */
  lastAudioAt: number;
  /** Highest `packetsReceived` observed; grow-only, drives the fallback delta. */
  packetsSeen: number;
  /** True once any RTP packet arrived — the gain pipe may only be built after
   *  this (a pipe created before the track's first packet is bound dead). */
  flowed: boolean;
}

export interface SlotActivityOptions {
  slots: ReadonlyMap<number, ActivitySlot>;
  onActivity(clientId: number, active: boolean): void;
  /** First packet on a slot: the caller re-applies playback (which may upgrade
   *  it from element volume to the gain pipe). */
  onFlow(): void;
  hangoverMs: number;
  intervalMs: number;
}

export interface SlotActivityMonitor {
  ensurePolling(): void;
  poll(): void;
  stop(): void;
}

/** Age of a synchronization-source timestamp, whatever clock it arrived on:
 *  epoch values are compared against `Date.now()`, `performance.now()` relative
 *  values against `performance.now()`. A future value clamps to 0. */
export function sourceAgeMs(timestamp: number, nowEpoch: number): number {
  const relative = typeof performance !== "undefined" ? performance.now() : Number.NaN;
  if (Number.isFinite(relative) && timestamp <= relative) return Math.max(0, relative - timestamp);
  return Math.max(0, nowEpoch - timestamp);
}

function syncSources(receiver: RTCRtpReceiver): RTCRtpSynchronizationSource[] | null {
  const read = (receiver as RTCRtpReceiver & { getSynchronizationSources?: () => RTCRtpSynchronizationSource[] }).getSynchronizationSources;
  if (typeof read !== "function") return null;
  try {
    return read.call(receiver) ?? [];
  } catch {
    return null;
  }
}

export function createSlotActivityMonitor(options: SlotActivityOptions): SlotActivityMonitor {
  const { slots } = options;
  let timer: number | null = null;
  let pending = false;

  /** Report level, not edges: the badge is a self-expiring hold that survives
   *  on repeated marks, so a single rising edge would let a continuously
   *  speaking member go dark between polls. */
  function report(slot: ActivitySlot, active: boolean): void {
    if (active || slot.active) options.onActivity(slot.clientId, active);
    slot.active = active;
  }

  function markFlowed(slot: ActivitySlot): void {
    if (slot.flowed) return;
    slot.flowed = true;
    options.onFlow();
  }

  function applySources(slot: ActivitySlot, sources: RTCRtpSynchronizationSource[]): void {
    if (sources.length === 0) {
      // No source at all: the hold alone decides (a just-ended spurt stays lit
      // through the hangover).
      report(slot, Date.now() - slot.lastAudioAt < options.hangoverMs);
      return;
    }
    markFlowed(slot);
    const latest = sources.reduce(
      (best, source) => (Number.isFinite(source.timestamp) ? Math.max(best, source.timestamp) : best),
      Number.NEGATIVE_INFINITY,
    );
    const now = Date.now();
    // A source without a usable timestamp is no information, never "packet
    // right now": keeping the previous mark would light every member forever
    // on an implementation that omits it.
    if (Number.isFinite(latest)) slot.lastAudioAt = now - sourceAgeMs(latest, now);
    report(slot, now - slot.lastAudioAt < options.hangoverMs);
  }

  function applyStats(slot: ActivitySlot, packets: number): void {
    if (packets > 0) markFlowed(slot);
    // Speaking = transmission, not decoded level: the counter grows whenever
    // the member transmits, regardless of element volume or mute.
    if (packets > slot.packetsSeen) slot.lastAudioAt = Date.now();
    slot.packetsSeen = packets;
    report(slot, Date.now() - slot.lastAudioAt < options.hangoverMs);
  }

  function poll(): void {
    if (pending || document.visibilityState === "hidden") return;
    const targets = [...slots.entries()].filter(([, slot]) => slot.receiver !== null && slot.clientId > 0);
    if (targets.length === 0) return;
    const fallback: Array<[number, ActivitySlot]> = [];
    for (const [slotIndex, slot] of targets) {
      const sources = syncSources(slot.receiver!);
      if (sources === null) { fallback.push([slotIndex, slot]); continue; }
      applySources(slot, sources);
    }
    if (fallback.length === 0) return;
    // One sweep at a time: a getStats() slower than the interval must not stack
    // snapshots and promises on the same slots.
    pending = true;
    void Promise.all(fallback.map(([slotIndex, slot]) => slot.receiver!.getStats()
      .then(report_ => {
        // A slot released while its report was in flight must not publish
        // activity for a speaker that is already gone.
        if (slots.get(slotIndex) !== slot) return;
        let packets = slot.packetsSeen;
        report_.forEach(entry => {
          if (entry.type === "inbound-rtp" && entry.kind === "audio" && typeof entry.packetsReceived === "number") {
            packets = entry.packetsReceived;
          }
        });
        applyStats(slot, packets);
      })
      .catch(() => undefined)))
      .finally(() => { pending = false; });
  }

  return {
    ensurePolling() {
      if (timer !== null || slots.size === 0) return;
      timer = window.setInterval(poll, options.intervalMs);
    },
    poll,
    stop() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    },
  };
}
