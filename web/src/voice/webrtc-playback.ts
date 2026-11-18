import { playbackDebugEnabled } from "./playback-debug";
import { createSlotActivityMonitor } from "./webrtc-slot-activity";
import { decideRoute } from "./webrtc-playback-route";
import { elementVolumeHonored } from "./element-volume-probe";

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
// The pipe renders into `AudioContext.destination` and nothing else. It used to
// run through a shared MediaStreamAudioDestinationNode played by a second hidden
// <audio> element, so that a boosted member could still follow a non-default
// output device (Chromium exposes no `AudioContext.setSinkId` here — verified
// 2026-11-18: `typeof AudioContext.prototype.setSinkId === "undefined"`). That
// detour drove the stream through three independent clock domains (receiver →
// AudioContext → media element) with no resampling anywhere between them, and
// the drift made every boosted member audibly change pitch and speed for as
// long as the pipe stayed up — on desktop as well as mobile. `destination` is
// driven by the audio device itself, so it shares the browser's clock handling.
// The cost is that a boosted gain cannot follow a non-default sink; the route
// therefore clamps it to 100% there and says so, instead of silently degrading.
export function createWebRtcPlayback(options: WebRtcPlaybackOptions) {
  let playbackGeneration = 0;
  const slots = new Map<number, SlotChannel>();
  let removeRetry: (() => void) | null = null;
  let ampContext: AudioContext | null = null;
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
    // Probes the media element on the first slot only; the answer is page-wide.
    elementVolumeHonored(element);
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

  function applySlotPlayback(slot: SlotChannel): void {
    const speaker = slot.clientId > 0 ? options.speakerVolume(slot.clientId) : 1;
    const master = options.volume();
    const combined = master * Math.max(0, Math.min(4, speaker));
    // A context that exists but cannot render must not have a pipe built for it:
    // doing so created and immediately destroyed an audio node pair on every
    // volume tick while the context stayed suspended.
    const contextReady = ampContext === null || ampRunning(ampContext);
    const decision = decideRoute({
      master,
      speaker,
      flowed: slot.flowed,
      contextRunning: contextReady,
      // A non-default sink cannot be reached through `AudioContext.destination`,
      // and routing a boosted gain through an element-played bus stretched
      // playback (see the module note). Clamping to 100% on that device is the
      // honest trade: audible and on the chosen device beats boosted and broken.
      sinkRoutable: sinkDevice === "",
      pipeAvailable: slot.amp !== null || contextReady,
      elementVolumeHonored: elementVolumeHonored(slot.element),
    });
    if (decision.route !== "pipe") {
      teardownAmp(slot);
      // `muted` rather than volume 0: iOS Safari ignores element.volume writes.
      slot.element.muted = decision.route === "muted";
      slot.element.volume = decision.elementVolume;
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, decision.route, decision.elementVolume);
      return;
    }
    const pipe = ensureAmp(slot);
    if (!pipe || !ampRunning(pipe.context)) {
      // The pipe could not be built or cannot render: keep the element audible
      // rather than muting it for a pipe nobody hears.
      teardownAmp(slot);
      slot.element.muted = false;
      slot.element.volume = Math.max(0, Math.min(1, combined));
      if (playbackDebug) console.info("[playback-debug] apply", slot.clientId, "pipe unavailable, element");
      return;
    }
    // The element stays attached and muted: the pipe carries the gain through
    // `AudioContext.destination`, so leaving both live would double the member.
    slot.element.muted = true;
    slot.element.volume = 1;
    pipe.gain.gain.value = Math.min(4, combined);
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
      // No explicit sampleRate: the context adopts the device's own rate, which
      // is also the rate `destination` renders at. Pinning 48 kHz here made the
      // graph resample against hardware that commonly runs 44.1 kHz.
      ampContext ??= new AudioContext();
      applySink(ampContext);
      installVisibilityResume();
      const source = ampContext.createMediaStreamSource(slot.stream);
      const gain = ampContext.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      // Straight into the device, never through a MediaStreamAudioDestinationNode
      // played by another element: that detour crosses three clock domains and
      // stretches playback (see the module note).
      gain.connect(ampContext.destination);
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
      // A gain pipe's context starts suspended on iOS Safari (and on any page
      // without a gesture yet); this runs from the gesture retry too, so a tap
      // resumes it and the slots upgrade from element volume to the pipe.
      const amp = ampContext;
      if (amp && amp.state !== "running" && amp.state !== "closed") {
        try { await amp.resume(); } catch { /* the gesture policy refused it */ }
      }
      if (slots.size === 0) return;
      for (const slot of slots.values()) applySlotPlayback(slot);
      if (generation !== playbackGeneration) return;
      const slotsNow = [...slots.values()];
      const results = await Promise.allSettled(slotsNow.map(slot => slot.element.play()));
      if (generation !== playbackGeneration) return;
      // A muted element depends entirely on the gain pipe, which renders into
      // the audio device and cannot be refused by the autoplay policy; an
      // unmuted one speaks for itself.
      const blocked = slotsNow.every((slot, index) => (
        slot.element.muted ? false : results[index]?.status === "rejected"
      ));
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
    /** Routes every slot element to the given output device ("": default).
     *  Elements created later pick it up from the stored value. Rejects if any
     *  target rejects, after every target was attempted, so callers can roll
     *  back their committed choice. A boosted gain is clamped to 100% while a
     *  non-default device is selected — the pipe plays on `destination`, which
     *  is always the default device (see the module note). */
    async setSinkDevice(deviceId: string): Promise<void> {
      sinkDevice = deviceId;
      // "" means "default output"; the sink API spells it "default".
      const requested = deviceId || "default";
      // undefined = nothing failed: a `null` sentinel here would be thrown on
      // complete success (null !== undefined), failing every sink change that
      // actually worked.
      let firstFailure: unknown = undefined;
      for (const element of slots.values()) {
        if (!element.element.setSinkId) continue;
        try { await element.element.setSinkId(requested); } catch (error) { firstFailure ??= error; }
      }
      // Re-apply so slots that could not render through the pipe (it was not
      // running yet) claim it now, and a boost clamps once a sink is chosen.
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
