import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type NativeCodec = {
  encode(pcm: Buffer): Buffer;
  decode(data: Buffer): Buffer;
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

  dispose(): void {
    // @discordjs/opus exposes no explicit destructor; the native handle is
    // released with the binding object once the session drops its reference.
  }
}
