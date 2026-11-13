interface RemotePlaybackOptions {
  getContext(): AudioContext;
  getVolume(clientId: number): number;
  onDecodeError(): void;
  onDrop(): void;
}

interface SpeakerPlayback {
  context: AudioContext;
  codec: number;
  decoder: AudioDecoder | null;
  gain: GainNode;
  sources: Set<AudioBufferSourceNode>;
  playTime: number;
  timestamp: number;
  primed: boolean;
  primeBuffers: AudioBuffer[];
  primeTimer: ReturnType<typeof setTimeout> | null;
}

// Codec 5 marks TeamSpeak stereo Opus — the accompaniment share path. The
// decoder must match the channel count or stereo accompaniment decodes as
// garbage, so a codec switch rebuilds the per-speaker decoder.
const CODEC_CHANNELS: Record<number, number> = { 4: 1, 5: 2 };

// Preserve the compatibility path's bounded jitter buffer and decoder queue.
// The window is sized for this path's transport, not for taste: WebSocket
// audio shares one ordered TCP stream, so a single loss stalls every later
// frame (head-of-line blocking) and delivers them as 100-300 ms bursts. A
// shallow window would drop mid-word speech on every stall; the deep one
// rides the burst out instead. The cap self-drains — steady-state latency
// tracks the arrival cadence (~20-40 ms) and only post-stall backlog rides
// the cap until the next talk gap underruns the timeline.
const MAX_PLAY_AHEAD_SECONDS = 0.25;
// Decoder queue depth that counts as "the decoder is not keeping up". It is
// sized against the jitter window above, not against the arrival cadence: a
// 100-300 ms WS stall delivers a burst of frames at once, and a 3-frame (60 ms)
// limit reset the whole speaker stream — already scheduled audio included —
// before the 250 ms window could ride the burst out. At 12 frames (240 ms) only
// a decoder that is a full window behind trips the reset.
const MAX_DECODE_QUEUE_FRAMES = 12;
// Overflow drops the late frame instead of resetting the stream, so the burst
// glitch no longer cuts audio that was already scheduled; only a deep backlog
// (suspended context, desynced timeline) keeps the reset as a safety net
// against unbounded decoder state. Must stay above MAX_PLAY_AHEAD_SECONDS:
// normal accumulation never exceeds the window, so only a desync trips this.
const MAX_BACKLOG_SECONDS = 0.3;
// Talk-spike pre-roll (aligned with the TS6 client): hold a stream's first
// frames until PRIME_MIN_FRAMES are queued or PRIME_MAX_WAIT_MS elapsed, so
// the second frame is not chased by an underrun at talk-sput onset.
const PRIME_MIN_FRAMES = 2;
const PRIME_MAX_WAIT_MS = 60;

export function createRemotePlayback(options: RemotePlaybackOptions) {
  const speakers = new Map<number, SpeakerPlayback>();

  function clear(clientId: number): void {
    const stream = speakers.get(clientId);
    if (!stream) return;
    // Invalidate callbacks before closing their resources.
    speakers.delete(clientId);
    if (stream.primeTimer !== null) clearTimeout(stream.primeTimer);
    stream.primeBuffers.length = 0;
    try { stream.decoder?.close(); } catch { /* decoder may already be closed */ }
    for (const source of stream.sources) {
      try { source.stop(); } catch { /* not started or already ended */ }
      source.disconnect();
    }
    stream.sources.clear();
    stream.gain.disconnect();
  }

  function schedule(stream: SpeakerPlayback, buffer: AudioBuffer): void {
    const { context, gain, sources } = stream;
    const playTime = Math.max(stream.playTime, context.currentTime);
    if (playTime + buffer.duration > context.currentTime + MAX_PLAY_AHEAD_SECONDS) {
      // The new frame overshoots the jitter window: drop just this frame —
      // the already scheduled audio keeps playing and the window reopens as
      // the timeline drains (a full reset used to cut the audio mid-frame).
      options.onDrop();
      return;
    }
    const source = context.createBufferSource();
    sources.add(source);
    source.buffer = buffer;
    source.connect(gain);
    source.addEventListener("ended", () => {
      source.disconnect();
      // The old stream owns this set; never delete a replacement's resources.
      sources.delete(source);
    }, { once: true });
    source.start(playTime);
    stream.playTime = playTime + buffer.duration;
  }

  /** Pre-roll expiry/fulfilment: schedule the held head frames in one pass. */
  function flushPrime(clientId: number, stream: SpeakerPlayback): void {
    const buffers = stream.primeBuffers;
    stream.primeBuffers = [];
    stream.primed = true;
    if (stream.primeTimer !== null) {
      clearTimeout(stream.primeTimer);
      stream.primeTimer = null;
    }
    if (speakers.get(clientId) !== stream) return;
    for (const buffer of buffers) schedule(stream, buffer);
  }

  function prime(clientId: number, stream: SpeakerPlayback, buffer: AudioBuffer): void {
    stream.primeBuffers.push(buffer);
    if (stream.primeBuffers.length >= PRIME_MIN_FRAMES) {
      flushPrime(clientId, stream);
      return;
    }
    stream.primeTimer = setTimeout(() => {
      stream.primeTimer = null;
      flushPrime(clientId, stream);
    }, PRIME_MAX_WAIT_MS);
  }

  function output(clientId: number, stream: SpeakerPlayback, chunk: AudioData): void {
    try {
      if (speakers.get(clientId) !== stream) return;
      const { context } = stream;
      const { sampleRate, numberOfChannels, numberOfFrames } = chunk;
      const buffer = context.createBuffer(numberOfChannels, numberOfFrames, sampleRate);
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const samples = new Float32Array(numberOfFrames);
        chunk.copyTo(samples, { planeIndex: channel, format: "f32-planar" });
        buffer.copyToChannel(samples, channel);
      }
      if (!stream.primed) prime(clientId, stream, buffer);
      else schedule(stream, buffer);
    } catch {
      if (speakers.get(clientId) === stream) {
        options.onDecodeError();
        clear(clientId);
      }
    } finally {
      chunk.close();
    }
  }

  function create(clientId: number, context: AudioContext, codec: number): SpeakerPlayback {
    const stream: SpeakerPlayback = {
      context, codec, decoder: null, gain: context.createGain(), sources: new Set(),
      playTime: context.currentTime, timestamp: 0,
      primed: false, primeBuffers: [], primeTimer: null,
    };
    speakers.set(clientId, stream);
    stream.gain.gain.value = options.getVolume(clientId);
    stream.gain.connect(context.destination);
    stream.decoder = new AudioDecoder({
      output: chunk => output(clientId, stream, chunk),
      error: () => {
        if (speakers.get(clientId) !== stream) return;
        options.onDecodeError();
        clear(clientId);
      },
    });
    stream.decoder.configure({ codec: "opus", sampleRate: 48000, numberOfChannels: CODEC_CHANNELS[codec] ?? 1 });
    return stream;
  }

  function play(clientId: number, opusData: Uint8Array, codec = 4): void {
    if (opusData.length < 3) { options.onDrop(); return; }
    try {
      const context = options.getContext();
      let stream = speakers.get(clientId);
      if (stream && (stream.context !== context || stream.codec !== codec || stream.playTime > context.currentTime + MAX_BACKLOG_SECONDS || (stream.decoder?.decodeQueueSize ?? 0) >= MAX_DECODE_QUEUE_FRAMES)) {
        clear(clientId);
        stream = undefined;
      }
      stream ??= create(clientId, context, codec);
      if (speakers.get(clientId) !== stream) return;
      stream.decoder?.decode(new EncodedAudioChunk({ type: "key", timestamp: stream.timestamp, duration: 20_000, data: opusData }));
      stream.timestamp += 20_000;
    } catch {
      options.onDecodeError();
      clear(clientId);
    }
  }

  return {
    play,
    clear,
    clearAll() { for (const id of speakers.keys()) clear(id); },
    updateVolume(clientId: number) {
      const stream = speakers.get(clientId);
      if (stream) stream.gain.gain.value = options.getVolume(clientId);
    },
    updateVolumes() { for (const [id, stream] of speakers) stream.gain.gain.value = options.getVolume(id); },
  };
}
