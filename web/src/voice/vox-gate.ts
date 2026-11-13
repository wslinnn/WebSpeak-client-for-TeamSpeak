/** Voice-activation gate for the compatibility (WebSocket) uplink.
 *
 *  The gate decides whether a 20 ms capture frame is speech. Two properties
 *  matter for audio quality:
 *
 *  - The decision uses the whole frame. Measuring only its head (the first
 *    256 samples, 5 ms) let a plosive or a slow word onset sit below the
 *    threshold while the rest of the frame carried speech, and the frame was
 *    dropped — the first syllable of a word disappeared.
 *  - The threshold is compared against the pre-gain level. The capture tap sits
 *    after the input gain and limiter, so comparing the post-gain level made
 *    the input-volume slider change what counts as speech: turning the gain
 *    down could close the gate on normal speech. */

/** Frames the gate stays open after the last speech frame (15 × 20 ms). */
const VOX_HOLD_FRAMES = 15;
/** Speech frames required before the gate opens (one frame: no added onset
 *  latency beyond the frame itself). */
const VOX_ATTACK_FRAMES = 1;

export interface VoxGateState {
  attack: number;
  release: number;
}

export function createVoxGateState(): VoxGateState {
  return { attack: 0, release: 0 };
}

/** Clears the hold window (mute, capture stop, session reset). */
export function resetVoxGate(state: VoxGateState): void {
  state.attack = 0;
  state.release = 0;
}

/** Root-mean-square of a whole frame, in normalized sample units. */
export function frameEnergy(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index++) sum += samples[index]! * samples[index]!;
  return Math.sqrt(sum / samples.length);
}

/** The frame's level: the capture worklet already measured the whole frame and
 *  sends the value along, so it wins; the ScriptProcessor fallback (and any
 *  caller without a level) is measured here — over the whole frame. */
export function captureFrameEnergy(samples: Float32Array, rms?: number): number {
  return typeof rms === "number" && Number.isFinite(rms) && rms >= 0 ? rms : frameEnergy(samples);
}

/** One frame through the gate. `energy` is the post-gain frame level and
 *  `inputGain` the gain the tap applied, so the threshold keeps its meaning
 *  whatever the slider says. Returns whether the frame is transmitted. */
export function gateVoiceFrame(state: VoxGateState, energy: number, threshold: number, inputGain: number): boolean {
  if (!(inputGain > 0)) {
    // A silent gain stage carries no speech; keeping the gate open would send
    // comfort noise and hold TeamSpeak in the speaking state.
    state.attack = 0;
    state.release = 0;
    return false;
  }
  const level = energy / inputGain;
  if (level >= threshold) {
    state.attack = Math.min(VOX_ATTACK_FRAMES, state.attack + 1);
    state.release = VOX_HOLD_FRAMES;
    return state.attack >= VOX_ATTACK_FRAMES;
  }
  state.attack = 0;
  if (state.release > 0) {
    state.release--;
    return true;
  }
  return false;
}
