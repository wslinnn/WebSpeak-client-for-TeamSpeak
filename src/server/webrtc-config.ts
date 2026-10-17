import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { MAX_ACTIVE_SESSIONS } from "../constants.js";
import { normalizeVoiceMediaHost } from "../shared/voice-ice.js";

/** Default WebRTC media port range used by WebSpeak and its Docker image.
 *  100 ports covered ~50 sessions at two sockets per session（报告 21 F2）:
 *  the default now covers the 100-session ceiling with an address margin. */
export const DEFAULT_WEBRTC_UDP_PORT_RANGE: [number, number] = [40000, 41999];

// Kept as a public alias for callers that used the original fixed-range name.
export const WEBRTC_UDP_PORT_RANGE = DEFAULT_WEBRTC_UDP_PORT_RANGE;
export const WEBRTC_UDP_PORT_MIN = 1024;
export const WEBRTC_UDP_PORT_MAX = 65535;

/** 需要的最小跨度：会话上限 × 每会话 2 个端口（每块网卡地址一枚 socket，
 *  外加 publicHost/附加地址）。低于此值满载时必然丢候选、静默回退兼容传输。 */
export const MIN_WEBRTC_UDP_PORT_RANGE_PORTS = MAX_ACTIVE_SESSIONS * 2;

/** SDP candidates must contain usable addresses, not the HTTP proxy's hostname. */
export async function resolveVoiceMediaAddresses(
  host: string | undefined,
  ipv6: boolean,
  resolve = (name: string) => lookup(name, { all: true }),
): Promise<string[]> {
  const normalized = normalizeVoiceMediaHost(host ?? "");
  if (!normalized) return [];
  const family = isIP(normalized);
  if (family) return family === 4 || ipv6 ? [normalized] : [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      resolve(normalized),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Media DNS timeout")), 1500); }),
    ]);
    return [...new Set(addresses.filter(value => value.family === 4 || ipv6 && value.family === 6).map(value => value.address))];
  } catch {
    // Host discovery and STUN may still work when the optional additional address does not.
    return [];
  } finally { clearTimeout(timer); }
}
