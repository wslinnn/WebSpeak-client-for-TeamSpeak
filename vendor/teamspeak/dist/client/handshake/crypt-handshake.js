import { randomBytes } from "node:crypto";
import { buildCommandOrdered } from "../../core/internal.js";
import { MAX_RSA_CHALLENGE_LEVEL } from "../crypto/crypt.js";
import { PuzzleTooHardError } from "../errors.js";
export const INIT_VERSION = 1566914096; // 3.5.0 [Stable]
const INIT_VERSION_LEN = 4;
const INIT_TYPE_LEN = 1;
const INIT_STEP_LEN = 21;
/** The RSA challenge each connection attempt, by its Crypt, is solving now. */
const solvingChallenges = new WeakMap();
/** The RSA challenge each connection attempt, by its Crypt, has answered. */
const answeredChallenges = new WeakMap();
/**
 * The RSA puzzle `crypt`'s attempt solved: the level the server demanded and
 * the milliseconds spent on it. Level 0 and no time when the server sent none.
 */
export function puzzleOf(crypt) {
    const answered = answeredChallenges.get(crypt);
    return { level: answered?.level ?? 0, durationMs: answered?.durationMs ?? 0 };
}
export function processInit1(crypt, data, signal) {
    if (data === null || (data.length >= 1 && data[0] === 0x7f)) {
        return buildInit1StartPacket();
    }
    // Init1 is not authenticated: a step that cannot be answered, an empty one
    // included, is ignored, and the attempt goes on with the real server's.
    if (data.length === 0)
        return null;
    switch (data[0]) {
        case 0:
            return buildInit1Step1Packet(data);
        case 1:
            return buildInit1Step2Packet(data);
        case 2:
            return buildInit1Step3Packet(data);
        case 3:
            return buildInit1Step4Packet(crypt, data, signal);
        case undefined:
        default:
            return null;
    }
}
function buildInit1StartPacket() {
    const sendData = new Uint8Array(INIT_VERSION_LEN + INIT_TYPE_LEN + 4 + 4 + 8);
    const view = new DataView(sendData.buffer);
    view.setUint32(0, INIT_VERSION, false);
    sendData[4] = 0x00;
    const nowSec = Math.floor(Date.now() / 1000);
    const clampedNow = Math.max(0, Math.min(nowSec, 0xffff_ffff));
    view.setUint32(5, clampedNow, false);
    const rng = randomBytes(4);
    sendData.set(rng, 9);
    return sendData;
}
function buildInit1Step1Packet(data) {
    if (data.length !== INIT_STEP_LEN)
        return null;
    const sendData = new Uint8Array(INIT_TYPE_LEN + 16 + 4);
    sendData[0] = 0x01;
    // TS rand: little-endian uint32 at offset [INIT_VERSION_LEN + INIT_TYPE_LEN + 4]
    const tsRandOffset = INIT_VERSION_LEN + INIT_TYPE_LEN + 4;
    const tsRand = data[tsRandOffset] |
        (data[tsRandOffset + 1] << 8) |
        (data[tsRandOffset + 2] << 16) |
        (data[tsRandOffset + 3] << 24);
    new DataView(sendData.buffer).setUint32(INIT_TYPE_LEN + 16, tsRand >>> 0, false);
    return sendData;
}
function buildInit1Step2Packet(data) {
    if (data.length !== INIT_STEP_LEN)
        return null;
    const sendData = new Uint8Array(INIT_VERSION_LEN + INIT_TYPE_LEN + 16 + 4);
    new DataView(sendData.buffer).setUint32(0, INIT_VERSION, false);
    sendData[4] = 0x02;
    sendData.set(data.slice(1, 21), 5);
    return sendData;
}
function buildInit1Step3Packet(data) {
    if (data.length !== INIT_VERSION_LEN + INIT_TYPE_LEN + 16 + 4)
        return null;
    const sendData = new Uint8Array(INIT_TYPE_LEN + 64 + 64 + 4 + 100);
    sendData[0] = 0x03;
    sendData[INIT_TYPE_LEN + 64 - 1] = 1;
    sendData[INIT_TYPE_LEN + 64 + 64 - 1] = 1;
    new DataView(sendData.buffer).setUint32(INIT_TYPE_LEN + 64 + 64, 1, false);
    return sendData;
}
function buildInit1Step4Packet(crypt, data, signal) {
    if (data.length !== INIT_TYPE_LEN + 64 + 64 + 4 + 100)
        return null;
    // One challenge per connection attempt, whose Crypt is its own. Each answer
    // can cost seconds of squarings, and a second would choose a new alpha
    // behind the clientinitiv already sent. The same challenge again means the
    // server did not get our answer, so it gets the same answer, without solving
    // anything; a different one gets none. While one is being solved, all of
    // them wait for it.
    const answered = answeredChallenges.get(crypt);
    if (answered !== undefined) {
        return Buffer.from(answered.challenge).equals(Buffer.from(data)) ? answered.answer : null;
    }
    if (solvingChallenges.has(crypt))
        return null;
    const level = new DataView(data.buffer, data.byteOffset).getUint32(1 + 128, false);
    // A level too high is refused here, at once, before anything is solved.
    if (level > MAX_RSA_CHALLENGE_LEVEL)
        throw new PuzzleTooHardError(level, MAX_RSA_CHALLENGE_LEVEL);
    const challenge = Uint8Array.from(data);
    solvingChallenges.set(crypt, challenge);
    return solveInit1Challenge(crypt, challenge, level, signal).finally(() => {
        solvingChallenges.delete(crypt);
    });
}
async function solveInit1Challenge(crypt, data, level, signal) {
    const solveStarted = performance.now();
    const y = await crypt.solveRsaChallenge(data, 1, level, signal);
    const durationMs = performance.now() - solveStarted;
    const alphaB64 = Buffer.from(crypt.newAlpha()).toString("base64");
    const omegaB64 = crypt.identity.publicKey();
    const cmd = buildCommandOrdered("clientinitiv", [
        ["alpha", alphaB64],
        ["omega", omegaB64],
        ["ot", "1"],
        ["ip", ""],
    ]);
    const cmdBytes = Buffer.from(cmd);
    const sendData = new Uint8Array(INIT_VERSION_LEN + INIT_TYPE_LEN + 232 + 64 + cmdBytes.length);
    const view = new DataView(sendData.buffer);
    view.setUint32(0, INIT_VERSION, false);
    sendData[4] = 0x04;
    sendData.set(data.slice(1, 233), 5);
    sendData.set(y.slice(0, 64), 5 + 232);
    sendData.set(cmdBytes, 5 + 232 + 64);
    answeredChallenges.set(crypt, { challenge: data, answer: sendData, level, durationMs });
    return sendData;
}
//# sourceMappingURL=crypt-handshake.js.map