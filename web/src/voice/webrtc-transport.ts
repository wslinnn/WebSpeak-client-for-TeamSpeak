import { isSessionDescription, WEBRTC_UPLINK_OPUS_MAX_BITRATE_BPS, type WebRtcClientMessage } from "../../../src/shared/webrtc.js";
import { createWebRtcInput, type WebRtcInput } from "./webrtc-input.js";
import { createMicrophoneMeter, type MicrophoneMeter } from "./microphone-meter.js";
import { createWebRtcPlayback, type WebRtcPlaybackOptions } from "./webrtc-playback.js";

// Downstream speaking slots pre-negotiated in every offer. The gateway
// assigns TeamSpeak speakers to them LRU-style and announces assignments via
// voiceRoute messages; with the pool in place a new speaker never triggers a
// renegotiation. Must mirror MAX_DOWNSTREAM_SLOTS in src/server/webrtc-audio.ts.
const DOWNSTREAM_SLOTS = 12;

interface Microphone {
  context: AudioContext;
  stream: MediaStream;
  processedStream: MediaStream;
}

interface Connection {
  isCurrent(): boolean;
  send(message: WebRtcClientMessage): void;
}

interface TransportOptions {
  prepareMicrophone(): Promise<Microphone | null>;
  stunServer?(): string;
  stopPcm(): void;
  muted(): boolean;
  inputVolume(): number;
  accompanimentActive(): boolean;
  releaseAccompaniment(): void;
  onLevel(rms: number | null, track: MediaStreamTrack): void;
  onReady(): void;
  onFallback(reason: string, isCurrent: () => boolean): Promise<void>;
  /** Fired after every transition of the live attempt's transport state, as a
   *  full snapshot: plain getters cannot drive reactive consumers, so UI that
   *  mirrors the transport must subscribe here instead of polling. */
  onTransportChange?(state: { active: boolean; hasPeer: boolean }): void;
  playback: WebRtcPlaybackOptions;
}

interface Attempt {
  connection: Connection;
  peer: RTCPeerConnection | null;
  input: WebRtcInput | null;
  meter: MicrophoneMeter | null;
  active: boolean;
  closed: boolean;
  answerTimer: number | null;
  cancelIce: (() => void) | null;
}

// One attempt owns peer negotiation, input, metering and remote playback. The
// caller continues to own microphone acquisition, PCM and the control socket.
export function createWebRtcTransport(options: TransportOptions) {
  let current: Attempt | null = null;
  let generation = 0;
  const playback = createWebRtcPlayback(options.playback);
  const isCurrent = (record: Attempt): boolean => current === record && !record.closed && record.connection.isCurrent();
  const clean = (operation: () => void): void => { try { operation(); } catch { /* release remaining resources */ } };
  const notifyTransport = (): void => {
    options.onTransportChange?.({ active: current?.active ?? false, hasPeer: (current?.peer ?? null) !== null });
  };

  function releaseInput(record = current): void {
    clean(options.releaseAccompaniment);
    if (!record) return;
    const input = record.input;
    const meter = record.meter;
    record.input = null;
    record.meter = null;
    if (input) clean(() => input.dispose());
    if (meter) clean(() => meter.dispose());
  }

  function stop(): void {
    generation++;
    const previous = current;
    current = null;
    if (previous) {
      previous.closed = true;
      previous.active = false;
      if (previous.answerTimer !== null) window.clearTimeout(previous.answerTimer);
      previous.answerTimer = null;
      const cancelIce = previous.cancelIce;
      previous.cancelIce = null;
      if (cancelIce) clean(cancelIce);
      releaseInput(previous);
    }
    clean(() => playback.stop());
    const peer = previous?.peer;
    if (previous) previous.peer = null;
    if (peer) {
      clean(() => { peer.ontrack = null; });
      clean(() => { peer.onconnectionstatechange = null; });
      clean(() => peer.close());
    }
    notifyTransport();
  }

  async function fail(record: Attempt, reason: string): Promise<void> {
    if (!isCurrent(record)) return;
    // Signaling is best-effort once the transport fails. It cannot prevent
    // local teardown or compatibility capture when the socket send throws.
    clean(() => record.connection.send({ type: "webrtcStop" }));
    stop();
    const fallbackGeneration = generation;
    const isFallbackCurrent = (): boolean => generation === fallbackGeneration && record.connection.isCurrent();
    if (isFallbackCurrent()) await options.onFallback(reason, isFallbackCurrent);
  }

  async function waitForIce(record: Attempt, peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === "complete") return;
    await new Promise<void>(resolve => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        clean(() => peer.removeEventListener("icegatheringstatechange", onStateChange));
        record.cancelIce = null;
        resolve();
      };
      const onStateChange = (): void => { if (peer.iceGatheringState === "complete") finish(); };
      const timer = window.setTimeout(finish, 5_000);
      record.cancelIce = finish;
      peer.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  async function start(connection: Connection): Promise<void> {
    stop();
    const record: Attempt = { connection, peer: null, input: null, meter: null,
      active: false, closed: false, answerTimer: null, cancelIce: null };
    current = record;
    notifyTransport();
    let microphone: Microphone | null;
    try { microphone = await options.prepareMicrophone(); }
    catch (error) { if (isCurrent(record)) throw error; return; }
    if (!isCurrent(record) || !microphone) return;
    const { context, stream, processedStream } = microphone;
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("没有可用的麦克风音轨");

    try {
      options.stopPcm();
      const stunServer = options.stunServer?.();
      const peer = new RTCPeerConnection({ iceServers: stunServer ? [{ urls: stunServer }] : [] });
      record.peer = peer;
      notifyTransport();
      track.enabled = !options.muted();
      const input = createWebRtcInput(context, processedStream, options.muted() ? 0 : options.inputVolume());
      record.input = input;
      peer.addTrack(input.stream.getAudioTracks()[0]!, input.stream);
      // The downstream slot pool rides in the same offer: one recvonly
      // transceiver per slot, after the uplink m-line the addTrack created.
      for (let slot = 0; slot < DOWNSTREAM_SLOTS; slot++) {
        peer.addTransceiver("audio", { direction: "recvonly" });
      }
      // The first transceiver carries the uplink; slot i lives in
      // transceiver i + 1 (see the gateway's createAnswer).
      peer.ontrack = event => {
        if (!isCurrent(record)) return;
        const slotIndex = peer.getTransceivers().indexOf(event.transceiver) - 1;
        if (slotIndex < 0 || slotIndex >= DOWNSTREAM_SLOTS) return;
        try { playback.attach(event.streams[0] ?? new MediaStream([event.track]), slotIndex); }
        catch { void fail(record, "WEBRTC_PLAYBACK_FAILED"); }
      };
      record.meter = createMicrophoneMeter(context, stream, rms => options.onLevel(rms, track));
      peer.onconnectionstatechange = () => {
        if (isCurrent(record) && peer.connectionState === "failed") void fail(record, "WEBRTC_CONNECTION_FAILED");
      };

      record.active = true;
      notifyTransport();
      const offer = await peer.createOffer();
      if (!isCurrent(record)) return;
      await peer.setLocalDescription(offer);
      if (!isCurrent(record)) return;
      await waitForIce(record, peer);
      if (!isCurrent(record)) return;
      const description = peer.localDescription;
      if (!description || description.type !== "offer") throw new Error("WebRTC offer was not created");
      connection.send({ type: "webrtcOffer", payload: {
        sdp: { type: "offer", sdp: description.sdp },
        muted: options.muted(), accompanimentActive: options.accompanimentActive(),
      } });
      record.answerTimer = window.setTimeout(() => {
        if (!isCurrent(record)) return;
        record.answerTimer = null;
        if (!peer.remoteDescription) void fail(record, "WEBRTC_ANSWER_TIMEOUT");
      }, 8_000);
    } catch {
      await fail(record, "WEBRTC_NEGOTIATION_FAILED");
    }
  }

  async function applyAnswer(description: unknown): Promise<void> {
    const record = current;
    const peer = record?.peer;
    if (!record || !peer || !isCurrent(record) || !isSessionDescription(description, "answer")) return;
    try {
      await peer.setRemoteDescription(description);
      if (!isCurrent(record)) return;
      // The gateway's answer fmtp only raises the negotiated ceiling; without
      // a matching encoder target Chrome keeps its ~32 kbps default. A
      // rejection here merely leaves the default quality — the transport is
      // up, so it must not fail the attempt.
      try {
        const sender = peer.getSenders().find(candidate => candidate.track?.kind === "audio");
        const parameters = sender?.getParameters();
        if (sender && parameters) {
          parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
          parameters.encodings[0]!.maxBitrate = WEBRTC_UPLINK_OPUS_MAX_BITRATE_BPS;
          await sender.setParameters(parameters);
        }
      } catch { /* default encoder settings remain active */ }
      if (record.answerTimer !== null) window.clearTimeout(record.answerTimer);
      record.answerTimer = null;
      record.active = true;
      notifyTransport();
      options.onReady();
    } catch { await fail(record, "WEBRTC_ANSWER_REJECTED"); }
  }

  return {
    start, stop, applyAnswer,
    get generation(): number { return generation; },
    releaseInput(): void { releaseInput(); },
    async fallback(reason: string): Promise<void> { if (current) await fail(current, reason); },
    get peer(): RTCPeerConnection | null { return current?.peer ?? null; },
    get input(): WebRtcInput | null { return current?.input ?? null; },
    get active(): boolean { return current?.active ?? false; },
    get output() { return playback.output; },
    setOutputVolume: playback.setVolume,
    /** Binds TeamSpeak client ids to the downstream slots (0 = free); each
     *  bound slot re-reads its per-speaker gain. */
    setSlotClients: (slots: readonly number[]): void => playback.setSlotClients(slots),
    /** Re-reads the stored volume on every slot bound to this speaker. */
    refreshSpeakerVolume: (clientId: number): void => playback.refreshSpeakerVolume(clientId),
  };
}
