import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

export interface MicrophoneProcessingSettings {
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  rnnoise: boolean | null;
}

export interface MicrophoneCapture {
  processedStream: MediaStream;
  processing: MicrophoneProcessingSettings;
  activate(): void;
  setVolume(value: number): void;
  /** Mixes application audio into the uplink destination, bypassing the
   *  microphone gain and denoise; null removes a previous accompaniment. */
  setAccompaniment(stream: MediaStream | null): void;
  stopCapture(): void;
  dispose(): void;
}

interface CaptureOptions {
  context: AudioContext;
  stream: MediaStream;
  noiseSuppression: boolean;
  volume: number;
  signal: AbortSignal;
  assertCurrent(): void;
  onSamples(input: Float32Array, rms?: number): void;
}

// Each prepared graph owns its stream and nodes. It cannot publish PCM before
// activation, and aborting preparation never touches the currently live graph.
export function createMicrophoneCaptureFactory() {
  const modules = new WeakMap<AudioContext, Map<string, Promise<void>>>();
  let wasmPromise: Promise<ArrayBuffer> | null = null;
  function loadModule(ctx: AudioContext, url: string): Promise<void> {
    let cache = modules.get(ctx);
    if (!cache) { cache = new Map(); modules.set(ctx, cache); }
    let pending = cache.get(url);
    if (!pending) {
      const ownCache = cache;
      pending = ctx.audioWorklet.addModule(url).catch(error => {
        if (ownCache.get(url) === pending) ownCache.delete(url);
        throw error;
      });
      cache.set(url, pending);
    }
    return pending;
  }

  async function prepare(options: CaptureOptions): Promise<MicrophoneCapture> {
    const { context: ctx, stream, assertCurrent } = options;
    let source: MediaStreamAudioSourceNode | null = null;
    let denoiser: RnnoiseWorkletNode | null = null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    let gain: GainNode | null = null;
    let silent: GainNode | null = null;
    let worklet: AudioWorkletNode | null = null;
    let script: ScriptProcessorNode | null = null;
    let accompanimentSource: MediaStreamAudioSourceNode | null = null;
    let active = false;
    let disposed = false;
    const clean = (operation: () => void) => { try { operation(); } catch { /* release the other resources too */ } };
    function stopCapture() {
      active = false;
      // Only the PCM tap is torn down: the gain stage keeps feeding the
      // destination for the WebRTC uplink, so volume control survives a
      // transport's stopPcm (which runs on every WebRTC start).
      if (worklet) { clean(() => worklet!.port.close()); clean(() => worklet!.disconnect()); }
      if (script) clean(() => script!.disconnect());
      if (silent) clean(() => silent!.disconnect());
      worklet = null; script = null; silent = null;
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      stopCapture();
      if (denoiser) { clean(() => denoiser!.destroy()); clean(() => denoiser!.disconnect()); }
      if (source) clean(() => source!.disconnect());
      if (accompanimentSource) clean(() => accompanimentSource!.disconnect());
      if (destination) {
        clean(() => destination!.disconnect());
        for (const track of destination.stream.getTracks()) clean(() => track.stop());
      }
      for (const track of stream.getTracks()) clean(() => track.stop());
    }
    const onSamples = (samples: Float32Array, rms?: number) => {
      if (active && !disposed) options.onSamples(samples, rms);
    };
    options.signal.addEventListener("abort", dispose, { once: true });
    try {
      assertCurrent();
      const track = stream.getAudioTracks().find(candidate => candidate.readyState === "live");
      if (!track) throw new DOMException("No live microphone track", "NotFoundError");
      const settings = track.getSettings();
      source = ctx.createMediaStreamSource(stream);
      const supportsWorklet = typeof AudioWorkletNode !== "undefined" && Boolean(ctx.audioWorklet);
      if (options.noiseSuppression && supportsWorklet) {
        try {
          if (!wasmPromise) wasmPromise = loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }).catch(error => {
            wasmPromise = null;
            throw error;
          });
          const [wasmBinary] = await Promise.all([wasmPromise, loadModule(ctx, rnnoiseWorkletUrl)]);
          assertCurrent();
          denoiser = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
        } catch {
          assertCurrent(); // RNNoise is optional; cancellation is not a fallback.
        }
      }
      const processedSource = denoiser ?? source;
      if (denoiser) source.connect(denoiser);
      destination = ctx.createMediaStreamDestination();
      destination.channelCount = 1;
      destination.channelCountMode = "explicit";
      // Single gain stage: the destination carries the processed mix (post
      // denoise and gain) for the WebRTC uplink, the worklet taps the same
      // gain for the compatibility PCM path.
      gain = ctx.createGain();
      gain.gain.value = options.volume;
      processedSource.connect(gain);
      gain.connect(destination);
      silent = ctx.createGain();
      silent.gain.value = 0;
      if (supportsWorklet) {
        try {
          await loadModule(ctx, "/mic-capture-worklet.js");
          assertCurrent();
          worklet = new AudioWorkletNode(ctx, "webspeak-mic-capture", {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          });
          worklet.port.onmessage = (event: MessageEvent<{ samples?: Float32Array; rms?: number }>) => {
            if (event.data?.samples instanceof Float32Array) onSamples(event.data.samples, event.data.rms);
          };
        } catch {
          assertCurrent();
          if (worklet) { clean(() => worklet!.port.close()); clean(() => worklet!.disconnect()); }
          worklet = null;
        }
      }
      if (!worklet) {
        script = ctx.createScriptProcessor(1024, 1, 1);
        script.onaudioprocess = event => onSamples(event.inputBuffer.getChannelData(0));
      }
      const capture = worklet ?? script!;
      gain.connect(capture);
      capture.connect(silent);
      silent.connect(ctx.destination);
      assertCurrent();
      if (track.readyState !== "live") throw new DOMException("Microphone track ended", "NotReadableError");
      return {
        processedStream: destination.stream,
        processing: {
          echoCancellation: typeof settings.echoCancellation === "boolean" ? settings.echoCancellation : null,
          noiseSuppression: typeof settings.noiseSuppression === "boolean" ? settings.noiseSuppression : null,
          autoGainControl: typeof settings.autoGainControl === "boolean" ? settings.autoGainControl : null,
          rnnoise: Boolean(denoiser),
        },
        activate() { if (!disposed && (worklet || script)) active = true; },
        setVolume(value) { if (gain) gain.gain.value = value; },
        setAccompaniment(stream) {
          if (disposed) {
            if (stream) throw new DOMException("Microphone capture closed", "AbortError");
            return;
          }
          let candidate: MediaStreamAudioSourceNode | null = null;
          try {
            if (stream) {
              if (!stream.getAudioTracks().some(track => track.readyState === "live")) {
                throw new Error("Accompaniment has no live audio track");
              }
              candidate = ctx.createMediaStreamSource(stream);
              // Application audio retains its source level and bypasses the
              // microphone gain and denoise; the destination carries the mix.
              candidate.connect(destination!);
            }
          } catch (error) {
            if (candidate) clean(() => candidate!.disconnect());
            throw error;
          }
          const previous = accompanimentSource;
          accompanimentSource = candidate;
          if (previous) clean(() => previous.disconnect());
        },
        stopCapture,
        dispose,
      };
    } catch (error) {
      dispose();
      throw error;
    } finally {
      options.signal.removeEventListener("abort", dispose);
    }
  }
  return { prepare };
}
