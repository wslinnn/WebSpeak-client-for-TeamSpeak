// Gateway audio pipeline benchmark — the measurement side of the 04 report §8
// baseline table and of the capacity decisions in the 09 report §1.
//
//   npm run benchmark
//
// It measures the three per-frame paths the gateway actually runs today, not
// the deleted mixer:
//
//   1. compatibility uplink  — Int16 PCM → Opus encode at the pinned voice
//      quality (SessionAudioTransport.receivePcm);
//   2. WebRTC uplink gate    — Opus decode + JS RMS for the silence gate
//      (SessionAudioTransport.uplinkSpeech);
//   3. WebRTC downlink       — TOC duration parse + RTP packet construction +
//      a track write stub (WebRtcAudioSession.pushTeamSpeakVoice). Payloads
//      pass through byte-identically: there is no decode/mix/encode stage.
//
// The last row measures the compatibility egress framing (3-byte header +
// socket write) so the WS path's per-frame cost is visible next to the
// passthrough one. Everything is codec/framing work only — event-loop
// scheduling, TLS and real socket IO are out of scope, so treat the "cores"
// column as a floor, not a total.

const FRAME_SAMPLES = 960; // 20 ms at 48 kHz mono, matches session-audio.ts
const FRAME_BYTES = FRAME_SAMPLES * 2;
const FRAMES_PER_SECOND = 50;

const { createVoiceEncoder, OpusEncoder } = await import("../src/server/opus-codec.js");
const { opusFrameDurationMs } = await import("../src/server/opus-frame.js");
const { RtpHeader, RtpPacket } = await import("werift");

function speechLikeFrame(seed) {
  const pcm = Buffer.alloc(FRAME_BYTES);
  for (let index = 0; index < FRAME_SAMPLES; index++) {
    const absolute = seed * FRAME_SAMPLES + index;
    const envelope = 0.35 + 0.3 * Math.sin(2 * Math.PI * (3 + (seed % 7)) * (index / FRAME_SAMPLES));
    const value = envelope * (
      0.5 * Math.sin(2 * Math.PI * 180 * absolute / 48_000)
      + 0.3 * Math.sin(2 * Math.PI * 940 * absolute / 48_000)
      + 0.2 * Math.sin(1_2345.678 * absolute)
    );
    pcm.writeInt16LE(Math.max(-32_768, Math.min(32_767, Math.round(value * 12_000))), index * 2);
  }
  return pcm;
}

function summarize(durations) {
  const sorted = Float64Array.from(durations).sort();
  const at = (quantile) => sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return { mean, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] };
}

function bench(warmup, ticks, run) {
  for (let index = 0; index < warmup; index++) run(index);
  const durations = new Float64Array(ticks);
  for (let index = 0; index < ticks; index++) {
    const start = process.hrtime.bigint();
    run(index);
    durations[index] = Number(process.hrtime.bigint() - start) / 1e6;
  }
  return summarize(durations);
}

function row(label, stats, extra = "") {
  const ms = (value) => value.toFixed(4).padStart(9);
  console.log(
    `${label.padEnd(40)} mean${ms(stats.mean)}  p50${ms(stats.p50)}  p95${ms(stats.p95)}  max${ms(stats.max)} ms  ${extra}`,
  );
}

function perSecond(stats) {
  return stats.mean > 0 ? Math.round(1_000 / stats.mean) : 0;
}

function formatCores(cores) {
  return `${cores.toFixed(3)} core`;
}

/** Frames/s → cores for one path at a given concurrency. */
function coresFor(stats, framesPerSecond) {
  return stats.mean * framesPerSecond / 1_000;
}

// --- Codec throughput -------------------------------------------------------

const encoder = createVoiceEncoder();
const soloFrames = Array.from({ length: 4_000 }, (_, seed) => speechLikeFrame(seed));

const encodeStats = bench(500, 5_000, (index) => { encoder.encode(soloFrames[index % soloFrames.length]); });
const encodedSizes = [];
const encodedFrames = [];
for (let index = 0; index < 1_000; index++) {
  const encoded = encoder.encode(soloFrames[index]);
  encodedSizes.push(encoded.length);
  encodedFrames.push(encoded);
}
const encodedBytes = encodedSizes.reduce((sum, size) => sum + size, 0) / encodedSizes.length;
console.log(`\n== Codec throughput (48 kHz mono, 20 ms; uplink encoder pinned to 24 kbit/s + VOIP + FEC 10%) ==`);
row("compatibility uplink: opus encode", encodeStats,
  `≈${perSecond(encodeStats).toLocaleString("en-US")}/s/core, avg ${encodedBytes.toFixed(0)} B/frame`);

const decoder = new OpusEncoder(48_000, 1);
const decodeStats = bench(500, 5_000, (index) => { decoder.decode(encodedFrames[index % encodedFrames.length]); });
row("WebRTC uplink gate: opus decode", decodeStats, `≈${perSecond(decodeStats).toLocaleString("en-US")}/s/core`);

// --- Uplink silence gate (decode + JS RMS) ----------------------------------

function gateFrame(frame) {
  const pcm = decoder.decode(frame);
  if (!pcm || pcm.length < 2) return 0;
  let sum = 0;
  const samples = Math.floor(pcm.length / 2);
  for (let index = 0; index < samples; index++) {
    const value = pcm.readInt16LE(index * 2) / 32_768;
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}
const gateStats = bench(300, 2_000, (index) => { gateFrame(encodedFrames[index % encodedFrames.length]); });
row("WebRTC uplink gate: decode + RMS", gateStats, `≈${perSecond(gateStats).toLocaleString("en-US")}/s/core`);

// --- WebRTC downlink passthrough framing ------------------------------------

const outgoingPayloadType = 111;
// The sender's writeRtp: the gateway only frames the packet, werift does the
// rest (SSRC rewrite, RTCP bookkeeping). A counting stub keeps the measurement
// on the gateway side of the boundary.
const track = { writeRtp() { /* the sender owns SSRC and RTCP */ } };
let sequenceNumber = 0;
let timestamp = 0;
const passStats = bench(1_000, 20_000, (index) => {
  const payload = encodedFrames[index % encodedFrames.length];
  const durationMs = opusFrameDurationMs(payload);
  const samples = Math.round(durationMs * 48);
  const packet = new RtpPacket(new RtpHeader({
    payloadType: outgoingPayloadType,
    sequenceNumber,
    timestamp,
    ssrc: 0,
    marker: index === 0,
  }), payload);
  sequenceNumber = (sequenceNumber + 1) & 0xffff;
  timestamp = (timestamp + samples) >>> 0;
  track.writeRtp(packet);
});
row("WebRTC downlink: TOC + RTP framing", passStats, `≈${perSecond(passStats).toLocaleString("en-US")}/s/core`);

// --- Compatibility egress framing -------------------------------------------

const wsPackets = [];
const socket = { send(packet) { wsPackets.push(packet); } };
const egressStats = bench(1_000, 20_000, (index) => {
  const frame = encodedFrames[index % encodedFrames.length];
  const packet = Buffer.allocUnsafe(3 + frame.length);
  packet[0] = 4;
  packet.writeUInt16BE(513, 1);
  frame.copy(packet, 3);
  socket.send(packet);
  if (wsPackets.length > 32) wsPackets.length = 0;
});
row("compatibility egress: header + copy", egressStats, `≈${perSecond(egressStats).toLocaleString("en-US")}/s/core`);

// --- Projection onto the session × speaker matrix ---------------------------

console.log(`\n== Projection (codec/framing work only; ${FRAMES_PER_SECOND} frames/s per speaking path) ==`);
console.log(`${"scenario".padEnd(40)} projected CPU`);
const projections = [
  ["100 compat sessions, all speaking", coresFor(encodeStats, 100 * FRAMES_PER_SECOND)],
  ["100 WebRTC sessions, mic gated (uplink)", coresFor(gateStats, 100 * FRAMES_PER_SECOND)],
  ["100 WebRTC sessions, 4 speakers each", coresFor(passStats, 100 * 4 * FRAMES_PER_SECOND)],
  ["100 WebRTC sessions, 16 speakers each", coresFor(passStats, 100 * 16 * FRAMES_PER_SECOND)],
  ["100 compat sessions, 4 speakers each", coresFor(egressStats, 100 * 4 * FRAMES_PER_SECOND)],
];
for (const [label, cores] of projections) console.log(`${label.padEnd(40)} ${formatCores(cores)}`);

// --- Per-codec memory footprint --------------------------------------------

console.log(`\n== Memory footprint (RSS delta, indicative) ==`);
// @discordjs/opus creates the native encoder/decoder lazily on first use, so
// the pool is exercised once before the delta is read — a constructor-only
// pool measures the JS wrapper and reports a meaningless number.
const before = process.memoryUsage();
const pool = [];
for (let index = 0; index < 100; index++) {
  const codec = new OpusEncoder(48_000, 1);
  codec.encode(soloFrames[index % soloFrames.length]);
  codec.decode(encodedFrames[index % encodedFrames.length]);
  pool.push(codec);
}
const after = process.memoryUsage();
const perCodecKb = (after.rss - before.rss) / 100 / 1024;
console.log(`100 initialized codecs: ${perCodecKb.toFixed(1)} KB RSS each → ${(perCodecKb * 100 / 1024).toFixed(1)} MiB per 100 sessions' codec set`);
pool.length = 0;

console.log(`\nNotes:`);
console.log(`- "compatibility uplink" runs once per speaking WebSocket session; the WebRTC uplink forwards RTP untouched and pays only the gate row.`);
console.log(`- "WebRTC downlink" has no decode, mix or re-encode: it is the per-frame RTP framing the gateway adds on top of the relayed payload.`);
console.log(`- RSS deltas on Node include allocator slop; compare runs on the same machine, not absolute values.`);
