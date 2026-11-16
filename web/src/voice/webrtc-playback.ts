import { playbackDebugEnabled } from "./playback-debug";
import { createSlotActivityMonitor } from "./webrtc-slot-activity";

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
// flow-gated: per-speaker volume up to 100% rides element.volume, and only a
// gain other than 1 builds a gain pipe — never before the slot's first RTP
// packet, so a persisted >100% volume cannot poison itself at bind time.
//
// The pipe does NOT render through `AudioContext.destination`. Chromium has no
// `AudioContext.setSinkId` (verified 2026-11-16: absent on both the prototype
// and the instance), so a pipe rendered there could not follow the chosen
// output device: with a non-default device selected, the muted slot element
// would sit on the chosen device while the pipe played the room through the
// default one. Every slot's gain node therefore feeds one shared
// MediaStreamAudioDestinationNode, and a single hidden <audio> element plays
// that mix — an element can be routed, so per-member gain and device selection
// hold at the same time.
export function createWebRtcPlayback(options: WebRtcPlaybackOptions) {
  let playbackGeneration = 0;
  const slots = new Map<number, SlotChannel>();
  let removeRetry: (() => void) | null = null;
  let ampContext: AudioContext | null = null;
  /** Shared mix bus: every piped slot's gain node feeds it, and one routable
   *  element plays it (see the module note on why not
   *  `AudioContext.destination`). */
  let ampMix: MediaStreamAudioDestinationNode | null = null;
  let ampElement: SinkAudioElement | null = null;
  /** True while the bus element's autoplay is blocked. Its slots must keep
   *  using element volume then: muting them for a pipe nobody plays would
   *  silence the room. */
  let ampMixBlocked = false;
  let sinkDevice = "";
  const clean = (operation: () => void): void => { try { operation(); } catch { /* continue teardown */ } };
  // F8（报告 21）：350ms 是说话徽标边沿延迟（≤350ms）与 getStats 频率（24 槽
  // ≈69 次/秒，隐藏页签时整轮跳过）的折中。hangover 曾随轮询翻倍到 1.2s，实测
  // 终止延迟 ~1.2-1.55s 被判「太慢」——回到 600ms（覆盖 ~2 个轮询周期），
  // 词间隙桥接仍够，终止延迟回落到 ~0.6-0.95s。
  const SLOT_POLL_INTERVAL_MS = 350;
  // TeamSpeak transmits in VAD bursts with word gaps between them; the hold
  // bridges those gaps so the badge behaves like the native client's.
  const SLOT_SPEAKING_HANGOVER_MS = 600;

  // Playback state dump for `webspeak:playback-debug` — the runtime values
  // (slot binding, applied element volume, pipe state, packet flow) that the
  // member-volume chain cannot be diagnosed without in a real browser.
  const playbackDebug = playbackDebugEnabled();
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
          streamId: slot.stream.id,
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

  // Speaking badges and the pipe's flow gate are the monitor's business: it
  // owns the poll timer, the synchronization-source path and the statistics
  // fallback, plus the clock semantics of both.
  const activity = createSlotActivityMonitor({
    slots,
    hangoverMs: SLOT_SPEAKING_HANGOVER_MS,
    // F8（报告 21）：350ms 是说话徽标边沿延迟（≤350ms）与统计频率（24 槽 ≈69
    // 次/秒同步读取，隐藏页签整轮跳过）的折中。hangover 曾随轮询翻倍到 1.2s，
    // 实测终止延迟 ~1.2-1.55s 被判「太慢」——回到 600ms（覆盖 ~2 个轮询周期），
    // 词间隙桥接仍够，终止延迟回落到 ~0.6-0.95s。
    intervalMs: SLOT_POLL_INTERVAL_MS,
    onActivity: (clientId, active) => options.onSlotActivity(clientId, active),
    onFlow: () => { for (const slot of slots.values()) if (slot.flowed) applySlotPlayback(slot); },
  });

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
        // A renegotiated stream invalidates the amp pipe's source binding and
        // starts a new RTP timeline: the flow gate and the packet counter
        // belong to the previous stream (a stale `flowed` would build a pipe
        // before the new stream's first packet, and a stale `packetsSeen`
        // could sit above the new receiver's counter for a long time).
        teardownAmp(slot);
        slot.stream = stream;
        slot.element.srcObject = stream;
        slot.flowed = false;
        slot.packetsSeen = 0;
        slot.lastAudioAt = 0;
      }
    }
    slot.element.srcObject = slot.stream;
    applySlotPlayback(slot);
    activity.ensurePolling();
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
    if (combined === 0) {
      // Per-speaker mute. element.volume = 0 is ignored on iOS Safari, so the
      // member would keep playing at full volume there; `muted` is honored
      // everywhere and needs no gain pipe.
      teardownAmp(slot);
      slot.element.muted = true;
      slot.element.volume = 1;
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "speaker muted");
      return;
    }
    if (combined === 1) {
      teardownAmp(slot);
      slot.element.muted = false;
      slot.element.volume = 1;
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "element unity");
      return;
    }
    // Every other gain (attenuation and amplification alike) rides the gain
    // pipe: element.volume is ignored on iOS Safari, so an element-level 0.5
    // would leave the member at full volume and the master slider inert there.
    // The pipe's context is only trustworthy once the slot has received RTP:
    // created earlier it would be bound dead. Until then the element volume is
    // the best effort, and the flow poll upgrades the slot the moment packets
    // arrive.
    if (!slot.flowed) {
      teardownAmp(slot);
      slot.element.muted = false;
      slot.element.volume = clamp01(combined);
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "awaiting flow, element", clamp01(combined));
      return;
    }
    // A context that exists but is not running (autoplay policy, an iOS call)
    // cannot render: check before building a pipe, so a suspended window does
    // not create and immediately destroy an audio node pair on every volume
    // tick, slot binding or speaker refresh.
    if (ampContext && !ampRunning(ampContext)) {
      teardownAmp(slot);
      slot.element.muted = false;
      slot.element.volume = clamp01(combined);
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "pipe not running, element", clamp01(combined));
      return;
    }
    const pipe = ensureAmp(slot);
    if (!pipe || !ampRunning(pipe.context) || ampMixBlocked) {
      // The context refused to come up (autoplay policy, iOS interruption) or
      // the bus element's own playback was blocked: keep the element audible
      // rather than muting it for a pipe nobody plays.
      teardownAmp(slot);
      slot.element.muted = false;
      slot.element.volume = clamp01(combined);
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "pipe not playing, element", clamp01(combined));
      return;
    }
    // The pipe renders into its own playout element (the mix bus): that element
    // is a media element, so it follows the selected output device even on
    // browsers where `AudioContext` cannot. The slot element stays attached and
    // muted — it is the puller Chrome keeps alive for the remote track.
    slot.element.muted = true;
    slot.element.volume = 1;
    pipe.gain.gain.value = Math.min(4, combined);
    if (ampElement) ampElement.muted = false;
    if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "pipe", pipe.gain.gain.value);
  }

  /** Safari/iOS report an audio session interrupted by a call or another app as
   *  the non-standard `interrupted` state; only `running` renders audio, so
   *  everything else is treated alike (and a resume is attempted). */
  function ampRunning(context: AudioContext): boolean {
    const state = (context as AudioContext & { state: string }).state;
    if (state === "running") return true;
    if (state === "closed") return false;
    if (typeof context.resume === "function") void context.resume().catch(() => undefined);
    return false;
  }

  function ensureAmp(slot: SlotChannel): AmpPipe | null {
    if (slot.amp) return slot.amp;
    if (typeof AudioContext === "undefined") return null;
    try {
      ampContext ??= new AudioContext({ sampleRate: 48_000 });
      applySink(ampContext);
      installVisibilityResume();
      const mix = ensureAmpMix(ampContext);
      if (!mix) return null;      const source = ampContext.createMediaStreamSource(slot.stream);
      const gain = ampContext.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      // Into the shared bus, never straight into `destination`: only the bus's
      // element can follow the chosen output device.
      gain.connect(mix);
      const pipe: AmpPipe = { context: ampContext, source, gain };
      slot.amp = pipe;
      watchAmpContext();
      if (ampContext.state !== "running") {
        // Suspended (autoplay policy, iOS) or interrupted (a call): the element
        // stays audible at its element volume meanwhile, so re-apply as soon as
        // the context comes back.
        void ampContext.resume().then(() => { if (slot.amp === pipe) applySlotPlayback(slot); }).catch(() => undefined);
      }
      return pipe;
    } catch {
      return null;
    }
  }

  /** Attempts the bus element's playback and records whether the room can be
   *  heard through it. A blocked bus (autoplay policy) must leave the slots on
   *  element volume — muting them for a pipe nobody plays is a silent room. */
  function tryPlayBus(): Promise<void> {
    const element = ampElement;
    if (!element) return Promise.resolve();
    return Promise.resolve(element.play()).then(
      () => { ampMixBlocked = false; },
      () => { ampMixBlocked = true; },
    ).then(() => { for (const slot of slots.values()) applySlotPlayback(slot); });
  }

  /** The shared mix bus and its player element, created once per context. The
   *  element is what makes the piped gain routable; it is muted while it has
   *  nothing connected and unmuted by the first pipe. */
  function ensureAmpMix(context: AudioContext): MediaStreamAudioDestinationNode | null {
    if (ampMix && ampElement) return ampMix;
    try {
      const element = document.createElement("audio") as SinkAudioElement;
      element.autoplay = true;
      element.muted = true;
      element.setAttribute("playsinline", "");
      element.setAttribute("aria-hidden", "true");
      element.tabIndex = -1;
      const mix = context.createMediaStreamDestination();
      element.srcObject = mix.stream;
      document.body.append(element);
      applySink(element);
      ampMix = mix;
      ampElement = element;
      // A blocked autoplay here must not mute the room: the slots keep using
      // element volume until a gesture (play()) resumes the bus.
      void tryPlayBus();
      return mix;
    } catch {
      return null;
    }
  }

  let watchingAmpContext: AudioContext | null = null;
  let removeVisibilityResume: (() => void) | null = null;
  let removeAmpStateListener: (() => void) | null = null;

  /** A context that was running can still be suspended later (an iOS call, a
   *  backgrounded tab, a browser audio policy change). Every slot with a
   *  non-unity gain is muted on its element and depends on the pipe, so a
   *  suspended context would silence the room until the next gesture. Re-apply
   *  on every state change: suspended falls back to element volume, running
   *  restores the pipe. */
  function watchAmpContext(): void {
    const context = ampContext;
    if (!context || watchingAmpContext === context) return;
    watchingAmpContext = context;
    const onStateChange = (): void => {
      if (ampContext !== context) return;
      for (const slot of slots.values()) applySlotPlayback(slot);
    };
    clean(() => context.addEventListener("statechange", onStateChange));
    removeAmpStateListener = () => { removeAmpStateListener = null; watchingAmpContext = null; clean(() => context.removeEventListener("statechange", onStateChange)); };
  }

  /** Returning to the tab after iOS interrupted the audio session: the context
   *  often stays suspended until something calls resume() — and every non-unity
   *  slot is muted on its element while that is true. Unlike the autoplay retry
   *  (installed only while blocked), this lives for the playback lifetime. */
  function installVisibilityResume(): void {
    if (removeVisibilityResume) return;
    const handler = (): void => {
      const amp = ampContext;
      // Safari reports an audio session interrupted by a call or another app as
      // the non-standard `interrupted` state; it needs the same resume.
      if (document.visibilityState !== "visible" || !amp || amp.state === "running" || amp.state === "closed") return;
      void amp.resume()
        .then(() => { if (ampContext === amp) for (const slot of slots.values()) applySlotPlayback(slot); })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", handler);
    removeVisibilityResume = () => { document.removeEventListener("visibilitychange", handler); removeVisibilityResume = null; };
  }

  function teardownAmp(slot: SlotChannel): void {
    const pipe = slot.amp;
    slot.amp = null;
    if (!pipe) return;
    clean(() => pipe.source.disconnect());
    clean(() => pipe.gain.disconnect());
    // The bus element has nothing left to play: mute it rather than tear it
    // down (the next pipe reuses it), so a slot returning to unity does not
    // restart an audio element.
    if (![...slots.values()].some(candidate => candidate.amp)) {
      if (ampElement) clean(() => { ampElement!.muted = true; });
    }
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
      // A gain pipe's context starts suspended on iOS Safari (and on any page
      // without a gesture yet); this runs from the gesture retry too, so a tap
      // resumes it and the slots upgrade from element volume to the pipe.
      const amp = ampContext;
      if (amp && amp.state !== "running" && amp.state !== "closed") {
        try { await amp.resume(); } catch { /* the gesture policy refused it */ }
      }
      if (elements.length === 0) return;
      // The bus goes through tryPlayBus so its own blocked state stays in sync;
      // the slot elements are played directly.
      const results = await Promise.allSettled([
        ...[...slots.values()].map(slot => slot.element.play()),
        ...(ampElement ? [tryPlayBus()] : []),
      ]);
      if (generation !== playbackGeneration) return;
      for (const slot of slots.values()) applySlotPlayback(slot);
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
    if (slots.size === 0) activity.stop();
  }

  function stop(): void {
    playbackGeneration++;
    for (const slotIndex of [...slots.keys()]) releaseSlot(slotIndex);
    removeRetry?.();
    removeVisibilityResume?.();
    removeAmpStateListener?.();
    activity.stop();
    if (ampElement) {
      const element = ampElement;
      ampElement = null;
      ampMix = null;
      clean(() => { element.pause(); });
      clean(() => { element.srcObject = null; });
      clean(() => element.remove());
    }
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
      // The mix bus's element is where the piped gain actually plays, so it is
      // the target that matters most on browsers whose AudioContext cannot
      // route at all.
      if (ampElement) targets.push(ampElement);
      if (ampContext) targets.push(ampContext);
      // undefined = nothing failed: a `null` sentinel here would be thrown on
      // complete success (null !== undefined), failing every sink change that
      // actually worked.
      let firstFailure: unknown = undefined;
      for (const target of targets) {
        if (!target.setSinkId) continue;
        try { await target.setSinkId(requested); } catch (error) { firstFailure ??= error; }
      }
      // Re-apply so slots that could not render through the pipe (it was not
      // running yet) claim it now, and vice versa.
      for (const slot of slots.values()) applySlotPlayback(slot);
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
        const previous = slot.clientId;
        slot.clientId = clientId;
        // A reassigned slot speaks for a new member: the previous speaker's
        // hold must be cleared by the id it was lit with (reporting after the
        // rebind would clear the newcomer instead), and the volume re-read
        // follows below.
        slot.lastAudioAt = 0;
        if (slot.active) {
          slot.active = false;
          options.onSlotActivity(previous, false);
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
