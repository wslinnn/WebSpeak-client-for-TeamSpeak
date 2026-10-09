// Gateway audio pipeline benchmark — the measurement side of the 04 report §8
// baseline table (encode throughput, mixer tick budget, per-codec memory).
//
//   npm run benchmark
//
// It replicates the exact per-tick work of the WebRTC mixer in
// src/server/webrtc-audio.ts (Int32 accumulate → clip → Int16 write → Opus
// encode at the pinned voice quality) and projects it onto the session ×
// speaker matrix of the baseline table. The projection covers codec work
// only — RTP write, WebSocket IO and event-loop scheduling are out of scope —
// so treat the "cores" column as a floor, not a total.

const FRAME_SAMPLES = 960; // 20 ms at 48 kHz mono, matches webrtc-audio.ts
const FRAME_BYTES = FRAME_SAMPLES * 2;
const MIXER_HZ = 50;
const TICK_BUDGET_MS = 1000 / MIXER_HZ;

const { createVoiceEncoder, OpusEncoder } = await import("../src/server/opus-codec.js");

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
  const ms = (value) => value.toFixed(3).padStart(8);
  console.log(
    `${label.padEnd(44)} mean${ms(stats.mean)}  p50${ms(stats.p50)}  p95${ms(stats.p95)}  max${ms(stats.max)} ms  ${extra}`,
  );
}

function formatCores(cores) {
  return `${cores.toFixed(3)} core`;
}

// --- Solo codec throughput -------------------------------------------------

const encoder = createVoiceEncoder();
const soloFrames = Array.from({ length: 4_000 }, (_, seed) => speechLikeFrame(seed));

const encodeStats = bench(500, 5_000, (index) => { encoder.encode(soloFrames[index % soloFrames.length]); });
const encodedSizes = [];
for (let index = 0; index < 1_000; index++) encodedSizes.push(encoder.encode(soloFrames[index]).length);
const encodedBytes = encodedSizes.reduce((sum, size) => sum + size, 0) / encodedSizes.length;
console.log(`\n== Solo codec (48 kHz mono, 20 ms, pinned voice quality: 24 kbit/s + VOIP + FEC 10%) ==`);
row("opus encode", encodeStats, `≈${Math.round(encodeStats.mean > 0 ? 1000 / encodeStats.mean : 0).toLocaleString("en-US")} encodes/s/core, avg ${encodedBytes.toFixed(0)} B/frame`);

const decoder = new OpusEncoder(48_000, 1);
const encodedFrames = soloFrames.slice(0, 1_000).map((frame) => encoder.encode(frame));
const decodeStats = bench(500, 5_000, (index) => { decoder.decode(encodedFrames[index % encodedFrames.length]); });
row("opus decode", decodeStats, `≈${Math.round(decodeStats.mean > 0 ? 1000 / decodeStats.mean : 0).toLocaleString("en-US")} decodes/s/core`);

// --- Mixer scenarios (sessions × speakers → projected cores) ---------------

// Faithful replica of mixAndSendAudio()'s per-tick work for one session:
// accumulate every speaker's 20 ms frame into Int32, clip to Int16, encode.
function mixerTick(frames, volumes, scratch, pcm) {
  scratch.fill(0);
  for (let speaker = 0; speaker < frames.length; speaker++) {
    const frame = frames[speaker];
    const volume = volumes.get(speaker) ?? 1;
    for (let index = 0; index < FRAME_SAMPLES; index++) {
      scratch[index] += Math.round(frame.readInt16LE(index * 2) * volume);
    }
  }
  for (let index = 0; index < FRAME_SAMPLES; index++) {
    const sample = Math.max(-32_768, Math.min(32_767, scratch[index]));
    pcm.writeInt16LE(sample, index * 2);
  }
  return encoder.encode(pcm);
}

console.log(`\n== Mixer scenario projection (codec work only; tick budget ${TICK_BUDGET_MS.toFixed(0)} ms @ ${MIXER_HZ} Hz) ==`);
console.log(`${"scenario".padEnd(44)} tick p95      projected CPU`);
for (const sessions of [10, 50, 100]) {
  for (const speakers of [1, 4]) {
    const frames = Array.from({ length: speakers }, (_, speaker) => speechLikeFrame(97 + speaker));
    const volumes = new Map(frames.map((_, speaker) => [speaker, 1]));
    const scratch = new Int32Array(FRAME_SAMPLES);
    const pcm = Buffer.allocUnsafe(FRAME_BYTES);
    const scenarioEncoder = createVoiceEncoder();
    const stats = bench(300, 2_000, () => mixerTick(frames, volumes, scratch, pcm));
    const cores = stats.mean * MIXER_HZ / 1_000 * sessions;
    const overBudget = stats.p95 > TICK_BUDGET_MS ? "  !! tick budget exceeded" : "";
    console.log(
      `${`${sessions} sessions × ${speakers} speaker(s)`.padEnd(44)} ${stats.p95.toFixed(3).padStart(8)} ms  ${formatCores(cores)}${overBudget}`,
    );
    scenarioEncoder.dispose();
  }
}

// --- Per-codec memory footprint --------------------------------------------

console.log(`\n== Memory footprint (RSS delta, indicative) ==`);
const before = process.memoryUsage();
const pool = [];
for (let index = 0; index < 100; index++) pool.push(new OpusEncoder(48_000, 1));
const after = process.memoryUsage();
const perCodecKb = (after.rss - before.rss) / 100 / 1024;
console.log(`100 decoders: ${(perCodecKb).toFixed(1)} KB RSS each → ${(perCodecKb * 100 / 1024).toFixed(1)} MiB per 100 mixing sessions' decoder set`);
pool.length = 0;

console.log(`\nNotes:`);
console.log(`- Solo encode row doubles as the compatibility path uplink cost (one encode per speaking session).`);
console.log(`- Mixer rows double as the WebRTC path cost (one mix+encode per listening session at ${MIXER_HZ} Hz, idle-stopped when silent).`);
console.log(`- RSS deltas on Node include allocator slop; compare runs on the same machine, not absolute values.`);
