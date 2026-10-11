export type SinkAudioElement = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };

export interface WebRtcPlaybackOptions {
  context(): AudioContext | null;
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

interface SlotChannel {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  clientId: number;
  active: boolean;
}

// The gateway's old mixer used an Int16 RMS of 160 (≈0.5% of full scale) for
// its speaking indicator; the float-domain equivalent sits near 0.005, raised
// a little so breath and room noise stay quiet.
const SLOT_SPEAKING_RMS = 0.01;
const SLOT_POLL_INTERVAL_MS = 120;
const ANALYSER_SAMPLES = 1024;

// Downstream TeamSpeak audio arrives as one WebRTC stream per speaker (the
// gateway's slot pool). Each stream runs through its own gain node so member
// volume is applied locally, and through an analyser that drives the speaking
// indicator. Everything mixes into one MediaStream played by a single hidden
// audio element — that element keeps the existing sink routing, autoplay
// unlock and retry behavior untouched.
export function createWebRtcPlayback(options: WebRtcPlaybackOptions) {
  let output: SinkAudioElement | null = null;
  let mixDestination: MediaStreamAudioDestinationNode | null = null;
  let master: GainNode | null = null;
  const slots = new Map<number, SlotChannel>();
  let pollTimer: number | null = null;
  let removeRetry: (() => void) | null = null;
  // Bumped by stop(): an in-flight play attempt or a retry gesture captured
  // by a superseded playback must not touch the state of the one that
  // replaced it.
  let playbackGeneration = 0;
  const analyserBuffer = new Float32Array(ANALYSER_SAMPLES);

  const clean = (operation: () => void): void => { try { operation(); } catch { /* continue teardown */ } };

  function context(): AudioContext {
    const existing = options.context();
    if (existing) return existing;
    throw new Error("AudioContext is unavailable");
  }

  function ensureGraph(): void {
    if (mixDestination) return;
    const ctx = context();
    mixDestination = ctx.createMediaStreamDestination();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(mixDestination);
    output = document.createElement("audio") as SinkAudioElement;
    output.autoplay = true;
    output.muted = false;
    output.setAttribute("playsinline", "");
    output.setAttribute("aria-hidden", "true");
    output.tabIndex = -1;
    output.style.position = "fixed";
    output.style.width = "1px";
    output.style.height = "1px";
    output.style.opacity = "0";
    output.style.pointerEvents = "none";
    output.volume = Math.max(0, Math.min(1, options.volume()));
    output.srcObject = mixDestination.stream;
    document.body.append(output);
    options.onEndpoint(output);
    void play();
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
      const element = output;
      const ctx = options.context();
      const generation = playbackGeneration;
      if (!element || !ctx) return;
      if (ctx.state === "suspended") {
        try { await ctx.resume(); } catch { /* a real user gesture may still be required */ }
      }
      try {
        await element.play();
        if (generation !== playbackGeneration) return;
        removeRetry?.();
        options.onBlocked(false);
        options.onPlaying();
      } catch {
        if (generation !== playbackGeneration) return;
        options.onBlocked(true);
        installRetry();
      }
    })();
    playPending = attempt;
    void attempt.finally(() => { if (playPending === attempt) playPending = null; });
    return attempt;
  }

  function pollSlots(): void {
    for (const slot of slots.values()) {
      let sum = 0;
      try {
        slot.analyser.getFloatTimeDomainData(analyserBuffer);
        for (let index = 0; index < analyserBuffer.length; index++) sum += analyserBuffer[index]! * analyserBuffer[index]!;
      } catch { /* the node may be gone mid-poll */ }
      const active = Math.sqrt(sum / analyserBuffer.length) >= SLOT_SPEAKING_RMS;
      if (active !== slot.active) {
        slot.active = active;
        options.onSlotActivity(slot.clientId, active);
      }
    }
  }

  function ensurePolling(): void {
    if (pollTimer !== null || slots.size === 0) return;
    pollTimer = window.setInterval(pollSlots, SLOT_POLL_INTERVAL_MS);
  }

  function applySlotVolume(slot: SlotChannel): void {
    const volume = slot.clientId > 0 ? options.speakerVolume(slot.clientId) : 1;
    slot.gain.gain.value = Math.max(0, Math.min(4, volume));
  }

  function attach(stream: MediaStream, slotIndex: number): void {
    ensureGraph();
    const ctx = context();
    releaseSlot(slotIndex);
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = ANALYSER_SAMPLES * 2;
    source.connect(gain);
    gain.connect(analyser);
    gain.connect(master!);
    const slot: SlotChannel = { source, gain, analyser, clientId: 0, active: false };
    slots.set(slotIndex, slot);
    applySlotVolume(slot);
    ensurePolling();
  }

  function releaseSlot(slotIndex: number): void {
    const slot = slots.get(slotIndex);
    if (!slot) return;
    slots.delete(slotIndex);
    if (slot.active) {
      slot.active = false;
      options.onSlotActivity(slot.clientId, false);
    }
    clean(() => slot.source.disconnect());
    clean(() => slot.gain.disconnect());
    clean(() => slot.analyser.disconnect());
    if (slots.size === 0 && pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function stop(): void {
    playbackGeneration++;
    for (const slotIndex of [...slots.keys()]) releaseSlot(slotIndex);
    removeRetry?.();
    const element = output;
    output = null;
    if (element) {
      clean(() => element.pause());
      clean(() => { element.srcObject = null; });
      clean(() => element.remove());
    }
    if (master) { const node = master; master = null; clean(() => node.disconnect()); }
    if (mixDestination) { const node = mixDestination; mixDestination = null; clean(() => node.disconnect()); }
    options.onBlocked(false);
  }

  return {
    attach, stop, play,
    get output(): SinkAudioElement | null { return output; },
    setVolume(value: number): void {
      const level = Math.max(0, Math.min(1, value));
      // iOS Safari ignores element.volume for playback; `muted` is honored
      // everywhere, so silence must go through it, with volume as best effort.
      if (output) {
        clean(() => { output!.muted = level <= 0; });
        clean(() => { output!.volume = level; });
      }
    },
    setSlotClients(slotClientIds: readonly number[]): void {
      for (const [slotIndex, slot] of slots) {
        const clientId = slotClientIds[slotIndex] ?? 0;
        if (slot.clientId === clientId) continue;
        slot.clientId = clientId;
        applySlotVolume(slot);
      }
    },
    /** Re-reads the stored per-speaker volume for every slot bound to the
     *  given TeamSpeak client id. */
    refreshSpeakerVolume(clientId: number): void {
      for (const slot of slots.values()) {
        if (slot.clientId === clientId) applySlotVolume(slot);
      }
    },
  };
}
