import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type NativeCodec = {
  encode(pcm: Buffer): Buffer;
  decode(data: Buffer): Buffer;
  applyEncoderCTL?(ctl: number, value: number): void;
  setBitrate?(bps: number): void;
};

// Generic CTL passthrough ids from opus_defines.h. @discordjs/opus 0.10.0 has
// no dedicated FEC/loss-rate setters, so the encoder is tuned through these.
export const OPUS_SET_APPLICATION = 4000;
export const OPUS_SET_INBAND_FEC = 4012;
export const OPUS_SET_PACKET_LOSS_PERC = 4014;
export const OPUS_APPLICATION_VOIP = 2048;

/**
 * Fixed encode-side quality budget for the gateway's two Opus encoders (the
 * compatibility-path microphone encoder and the WebRTC mixer).
 *
 * - 24 kbit/s keeps roughly 90 mixed streams inside a 3 Mbit/s uplink while
 *   staying well above the 16 kbit/s speech floor.
 * - VOIP application makes speech tuning and inband FEC effective; the shared
 *   accompaniment path bypasses these encoders, so music is not the target.
 * - FEC assumes lossy internet paths without a live loss signal: redundancy
 *   scales with the 10% expected-loss assumption and stays bounded.
 */
export interface VoiceEncoderQuality {
  bitrateBps: number;
  voipApplication: boolean;
  inbandFec: boolean;
  expectedLossPercent: number;
}

export const VOICE_ENCODER_QUALITY: VoiceEncoderQuality = {
  bitrateBps: 24_000,
  voipApplication: true,
  inbandFec: true,
  expectedLossPercent: 10,
};

export class OpusEncoder {
  private readonly codec: NativeCodec;

  constructor(sampleRate: number, channels: number) {
    const { OpusEncoder: NativeOpusEncoder } = require("@discordjs/opus") as {
      OpusEncoder: new (rate: number, channelCount: number) => NativeCodec;
    };
    this.codec = new NativeOpusEncoder(sampleRate, channels);
  }

  encode(pcm: Buffer): Buffer {
    return this.codec.encode(pcm);
  }

  decode(data: Buffer): Buffer {
    return this.codec.decode(data);
  }

  /**
   * Applies the quality profile CTL by CTL: one unsupported control must not
   * silence the encoder by aborting the rest.
   */
  configureVoice(quality: VoiceEncoderQuality): void {
    const attempts: Array<[number, number]> = [];
    if (quality.voipApplication) attempts.push([OPUS_SET_APPLICATION, OPUS_APPLICATION_VOIP]);
    attempts.push([OPUS_SET_INBAND_FEC, quality.inbandFec ? 1 : 0]);
    if (quality.inbandFec) attempts.push([OPUS_SET_PACKET_LOSS_PERC, Math.max(0, Math.min(100, Math.round(quality.expectedLossPercent)))]);
    for (const [ctl, value] of attempts) {
      try { this.codec.applyEncoderCTL?.(ctl, value); } catch { /* keep the remaining controls */ }
    }
    try { this.codec.setBitrate?.(quality.bitrateBps); } catch { /* the codec default remains in effect */ }
  }

  dispose(): void {
    // @discordjs/opus exposes no explicit destructor; the native handle is
    // released with the binding object once the session drops its reference.
  }
}

/** Gateway encoders (uplink + mixer) share this configured entry point. */
export function createVoiceEncoder(sampleRate = 48_000, channels = 1): OpusEncoder {
  const encoder = new OpusEncoder(sampleRate, channels);
  encoder.configureVoice(VOICE_ENCODER_QUALITY);
  return encoder;
}
