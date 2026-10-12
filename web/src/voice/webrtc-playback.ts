export type SinkAudioElement = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };

export interface WebRtcPlaybackOptions {
  volume(): number;
  /** Per-speaker attenuation for a TeamSpeak client id (0-4, 1 = neutral). */
  speakerVolume(clientId: number): number;
  onEndpoint(output: SinkAudioElement): void;
  onBlocked(blocked: boolean): void;
  onPlaying(): void;
  /** Speaking detection for the downstream slots. `clientId` is 0 while the
   *  gateway has not announced the slot assignment yet. */
  onSlotActivity(clientId: number, active: boolean): void;
}

interface AmpPipe {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

interface SlotChannel {
  element: SinkAudioElement;
  stream: MediaStream;
  receiver: RTCRtpReceiver | null;
  clientId: number;
  active: boolean;
  lastAudioAt: number;
  /** Highest packetsReceived observed on this slot's receiver. A grow-only
   *  counter: it drives both the speaking delta and the flow gate. */
  packetsSeen: number;
  /** True once any RTP packet has arrived on the slot. The amplification
   *  pipe may only be built after this: a pipe whose context was created
   *  before the track's first packet is bound dead (see the module note). */
  flowed: boolean;
  amp: AmpPipe | null;
}

// Downstream TeamSpeak audio arrives as one WebRTC stream per speaker (the
// gateway's slot pool). Every stream plays through its own hidden <audio>
// element — an element pipeline is the only consumer Chrome pulls reliably
// regardless of when the AudioContext was created: a context that existed
// before a remote track started flowing never renders that track (its source
// nodes yield silence forever), which is exactly how the whole room went
// mute while stats kept counting arrivals. Web Audio is therefore opt-in AND
// flow-gated: per-speaker volume up to 100% rides element.volume, and only
// amplification beyond 100% builds a gain pipe — never before the slot's
// first RTP packet, so a persisted >100% volume cannot poison itself at bind
// time. Speaking detection counts receiver.getStats() packetsReceived deltas:
// packets flow whenever the member transmits, immune to element volume, mute
// and playout semantics that make decoded-audio levels drift with the very
// slider being dragged.
export function createWebRtcPlayback(options: WebRtcPlaybackOptions) {
  let playbackGeneration = 0;
  const slots = new Map<number, SlotChannel>();
  let pollTimer: number | null = null;
  let removeRetry: (() => void) | null = null;
  let ampContext: AudioContext | null = null;
  let sinkDevice = "";
  const clean = (operation: () => void): void => { try { operation(); } catch { /* continue teardown */ } };
  const SLOT_POLL_INTERVAL_MS = 150;
  // TeamSpeak transmits in VAD bursts with word gaps between them; the hold
  // bridges those gaps so the badge behaves like the native client's.
  const SLOT_SPEAKING_HANGOVER_MS = 1_200;

  // Playback state dump for `webspeak:playback-debug` — the runtime values
  // (slot binding, applied element volume, pipe state, packet flow) that the
  // member-volume chain cannot be diagnosed without in a real browser.
  const playbackDebug = (() => {
    try { return localStorage.getItem("webspeak:playback-debug") === "1"; } catch { return false; }
  })();
  if (playbackDebug) {
    (window as unknown as { __webspeakPlayback: () => Promise<unknown> }).__webspeakPlayback = async () => {
      const slotStates = [];
      for (const [index, slot] of slots) {
        let packets = -1;
        let level = -1;
        if (slot.receiver) {
          try {
            const report = await slot.receiver.getStats();
            report.forEach(entry => {
              if (entry.type === "inbound-rtp" && entry.kind === "audio") {
                packets = entry.packetsReceived ?? -1;
                level = entry.audioLevel ?? -1;
              }
            });
          } catch { /* the receiver may be gone */ }
        }
        slotStates.push({
          slot: index,
          clientId: slot.clientId,
          vol: slot.element.volume,
          muted: slot.element.muted,
          paused: slot.element.paused,
          flowed: slot.flowed,
          pipeGain: slot.amp ? slot.amp.gain.gain.value : null,
          packets,
          level,
        });
      }
      return { master: options.volume(), slots: slotStates };
    };
    console.info("[playback-debug] hook installed — call await __webspeakPlayback()");
  }

  function applySink(target: SinkAudioElement | (AudioContext & { setSinkId?: (deviceId: string) => Promise<void> })): void {
    if (!sinkDevice) return;
    clean(() => { void target.setSinkId?.(sinkDevice).catch(() => undefined); });
  }

  function createSlotElement(): SinkAudioElement {
    const element = document.createElement("audio") as SinkAudioElement;
    element.autoplay = true;
    element.muted = false;
    element.setAttribute("playsinline", "");
    element.setAttribute("aria-hidden", "true");
    element.tabIndex = -1;
    document.body.append(element);
    applySink(element);
    options.onEndpoint(element);
    return element;
  }

  function attach(stream: MediaStream, slotIndex: number, receiver: RTCRtpReceiver | null = null): void {
    let slot = slots.get(slotIndex);
    if (!slot) {
      slot = { element: createSlotElement(), stream, receiver, clientId: 0, active: false, lastAudioAt: 0, packetsSeen: 0, flowed: false, amp: null };
      slots.set(slotIndex, slot);
    } else {
      slot.receiver = receiver;
      if (slot.stream !== stream) {
        // A renegotiated stream invalidates the amp pipe's source binding.
        teardownAmp(slot);
        slot.stream = stream;
        slot.element.srcObject = stream;
      }
    }
    slot.element.srcObject = slot.stream;
    applySlotPlayback(slot);
    ensurePolling();
    void play();
  }

  function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  function applySlotPlayback(slot: SlotChannel): void {
    const master = options.volume();
    if (master <= 0) {
      // iOS Safari ignores element.volume; `muted` is honored everywhere.
      teardownAmp(slot);
      slot.element.muted = true;
      slot.element.volume = 1;
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "master muted");
      return;
    }
    const perSpeaker = slot.clientId > 0 ? options.speakerVolume(slot.clientId) : 1;
    const combined = master * Math.max(0, Math.min(4, perSpeaker));
    if (combined <= 1) {
      teardownAmp(slot);
      slot.element.muted = false;
      slot.element.volume = clamp01(combined);
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "element", clamp01(combined));
      return;
    }
    // Amplification beyond 100% needs a gain node, and the pipe's context is
    // only trustworthy once the slot has received RTP: created earlier it
    // would be bound dead. Until then the element renders at up to 100% and
    // the flow poll upgrades the slot the moment packets arrive.
    if (!slot.flowed) {
      teardownAmp(slot);
      slot.element.muted = false;
      slot.element.volume = 1;
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "awaiting flow, clamped", combined);
      return;
    }
    const pipe = ensureAmp(slot);
    if (!pipe) {
      slot.element.muted = false;
      slot.element.volume = 1;
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "pipe unavailable, clamped");
      return;
    }
    // The element stays attached and playing: it is the pipeline Chrome
    // reliably pulls, while the pipe renders the amplified copy.
    slot.element.muted = true;
    slot.element.volume = 1;
    pipe.gain.gain.value = Math.min(4, combined);
    if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "pipe", pipe.gain.gain.value);
  }

  function ensureAmp(slot: SlotChannel): AmpPipe | null {
    if (slot.amp) return slot.amp;
    if (typeof AudioContext === "undefined") return null;
    try {
      ampContext ??= new AudioContext({ sampleRate: 48_000 });
      if (ampContext.state === "suspended") void ampContext.resume().catch(() => undefined);
      applySink(ampContext);
      const source = ampContext.createMediaStreamSource(slot.stream);
      const gain = ampContext.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(ampContext.destination);
      slot.amp = { context: ampContext, source, gain };
      return slot.amp;
    } catch {
      return null;
    }
  }

  function teardownAmp(slot: SlotChannel): void {
    const pipe = slot.amp;
    slot.amp = null;
    if (!pipe) return;
    clean(() => pipe.source.disconnect());
    clean(() => pipe.gain.disconnect());
  }

  function installRetry(): void {
    if (removeRetry) return;
    const generation = playbackGeneration;
    const retry = (): void => { if (generation === playbackGeneration) void play(); };
    const events = ["pointerdown", "touchstart", "keydown"] as const;
    removeRetry = () => {
      for (const event of events) clean(() => window.removeEventListener(event, retry));
      clean(() => document.removeEventListener("visibilitychange", retry));
      removeRetry = null;
    };
    for (const event of events) window.addEventListener(event, retry, { passive: true });
    document.addEventListener("visibilitychange", retry);
  }

  let playPending: Promise<void> | null = null;

  function play(): Promise<void> {
    // Overlapping triggers (autoplay kickoff + retry gestures) share one
    // in-flight attempt instead of stacking resume/play calls.
    if (playPending) return playPending;
    const attempt = (async () => {
      const generation = playbackGeneration;
      const elements = [...slots.values()].map(slot => slot.element);
      if (elements.length === 0) return;
      const results = await Promise.allSettled(elements.map(element => element.play()));
      if (generation !== playbackGeneration) return;
      const blocked = results.every(result => result.status === "rejected");
      if (blocked) {
        options.onBlocked(true);
        installRetry();
      } else {
        removeRetry?.();
        options.onBlocked(false);
        options.onPlaying();
      }
    })();
    playPending = attempt;
    void attempt.finally(() => { if (playPending === attempt) playPending = null; });
    return attempt;
  }

  function pollSlots(): void {
    for (const slot of slots.values()) {
      if (!slot.receiver || slot.clientId <= 0) continue;
      void slot.receiver.getStats().then(report => {
        let packets = slot.packetsSeen;
        report.forEach(entry => {
          if (entry.type === "inbound-rtp" && entry.kind === "audio") packets = entry.packetsReceived ?? slot.packetsSeen;
        });
        // Flow gate: the first packet unlocks pipe creation for >100% gains.
        if (packets > 0 && !slot.flowed) {
          slot.flowed = true;
          applySlotPlayback(slot);
        }
        // Speaking = transmission, not decoded level: packets grow whenever
        // the member transmits, regardless of element volume or mute.
        if (packets > slot.packetsSeen) slot.lastAudioAt = Date.now();
        slot.packetsSeen = packets;
        const active = Date.now() - slot.lastAudioAt < SLOT_SPEAKING_HANGOVER_MS;
        if (active !== slot.active) {
          slot.active = active;
          options.onSlotActivity(slot.clientId, active);
        }
      }).catch(() => undefined);
    }
  }

  function ensurePolling(): void {
    if (pollTimer !== null || slots.size === 0) return;
    pollTimer = window.setInterval(pollSlots, SLOT_POLL_INTERVAL_MS);
  }

  function releaseSlot(slotIndex: number): void {
    const slot = slots.get(slotIndex);
    if (!slot) return;
    slots.delete(slotIndex);
    if (slot.active) {
      slot.active = false;
      options.onSlotActivity(slot.clientId, false);
    }
    teardownAmp(slot);
    clean(() => { slot.element.pause(); });
    clean(() => { slot.element.srcObject = null; });
    clean(() => slot.element.remove());
    if (slots.size === 0 && pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function stop(): void {
    playbackGeneration++;
    for (const slotIndex of [...slots.keys()]) releaseSlot(slotIndex);
    removeRetry?.();
    if (ampContext) {
      const context = ampContext;
      ampContext = null;
      clean(() => { void context.close().catch(() => undefined); });
    }
    options.onBlocked(false);
  }

  return {
    attach, stop, play,
    get output(): SinkAudioElement | null { return [...slots.values()].at(-1)?.element ?? null; },
    /** Routes every slot element and the amplification context to the given
     *  output device ("": default output). Elements created later pick it up
     *  from the stored value. Rejects if any target rejects, after every
     *  target was attempted, so callers can roll back their committed choice. */
    async setSinkDevice(deviceId: string): Promise<void> {
      sinkDevice = deviceId;
      // "" means "default output"; the sink API spells it "default".
      const requested = deviceId || "default";
      const targets: Array<SinkAudioElement | (AudioContext & { setSinkId?: (deviceId: string) => Promise<void> })> = [
        ...[...slots.values()].map(slot => slot.element),
      ];
      if (ampContext) targets.push(ampContext);
      let firstFailure: unknown = null;
      for (const target of targets) {
        if (!target.setSinkId) continue;
        try { await target.setSinkId(requested); } catch (error) { firstFailure ??= error; }
      }
      if (firstFailure !== undefined) throw firstFailure;
    },
    setVolume(_level?: number): void {
      // Master volume rides options.volume() — re-read it per slot.
      for (const slot of slots.values()) applySlotPlayback(slot);
    },
    /** Binds TeamSpeak client ids to the downstream slots (0 = free); each
     *  bound slot re-reads its per-speaker gain. */
    setSlotClients(slotClientIds: readonly number[]): void {
      if (playbackDebug) console.info("[playback-debug] setSlotClients", [...slotClientIds]);
      for (const [slotIndex, slot] of slots) {
        const clientId = slotClientIds[slotIndex] ?? 0;
        if (slot.clientId === clientId) continue;
        slot.clientId = clientId;
        // A reassigned slot speaks for a new member: the previous hold must
        // not light the newcomer, and the volume re-read follows below.
        slot.lastAudioAt = 0;
        if (slot.active) {
          slot.active = false;
          options.onSlotActivity(slot.clientId, false);
        }
        applySlotPlayback(slot);
      }
    },
    /** Re-reads the stored per-speaker volume for every slot bound to the
     *  given TeamSpeak client id. */
    refreshSpeakerVolume(clientId: number): void {
      let matched = 0;
      for (const slot of slots.values()) {
        if (slot.clientId === clientId) {
          matched++;
          applySlotPlayback(slot);
        }
      }
      if (playbackDebug) console.info("[playback-debug] refreshSpeakerVolume", clientId, "matched", matched, "of", slots.size);
    },
  };
}
