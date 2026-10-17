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

function isAcceptableRemoteIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second, third] = octets as [number, number, number];
  if (first === 0 || first === 127) return false;             // 本网 / 环回
  if (first === 169 && second === 254) return false;          // 链路本地（含云 metadata 169.254.169.254）
  if (first === 192 && second === 0 && third === 0) return false;   // IETF 协议分配
  if (first === 192 && second === 0 && third === 2) return false;   // TEST-NET-1
  if (first === 198 && (second === 18 || second === 19)) return false; // 基准测试
  if (first === 198 && second === 51 && third === 100) return false;   // TEST-NET-2
  if (first === 203 && second === 0 && third === 113) return false;    // TEST-NET-3
  if (first >= 224) return false;                             // 组播 / 保留 / 广播
  return true;                                                // RFC1918 / CGNAT / 公网单播（LAN 部署的合法对端）
}

function isSpecialIpv6(address: string): boolean {
  if (address === "::" || address === "::1") return true;   // 未指定 / 环回
  const firstHextet = address.split(":")[0] ?? "";
  if (/^fe[89ab][0-9a-f]$/.test(firstHextet)) return true;   // 链路本地 fe80::/10（fe80–febf）
  if (firstHextet.startsWith("ff")) return true;     // 组播 ff00::/8
  if (/^::(\d+\.\d+\.\d+\.\d+)?$/.test(address)) return true; // ::dotted-quad 等弃用翻译形态
  return false;
}

/** S1（报告 21）：对 offer 里的远端候选做地址策略，交给 werift 的
 *  `iceFilterCandidatePair` 在建对时拦下——被拒候选不会发出任何数据包。
 *  网关对每个接受的候选都会发 STUN 连通性检查，而下面这些地址不可能是真实
 *  浏览器的可达地址，只会把网关变成内网/环回/链路本地的探测原语或 DNS 解析器：
 *  - 非 IP 字面量（主机名/mDNS .local）：浏览器给网关的候选只会是 IP 或本来就
 *    解析不了的 .local 名；
 *  - 环回 / 本网 0 / 链路本地 / 组播 / 保留段（IPv4-mapped 与 ::dotted 形态按
 *    内嵌地址判定，防绕过）。
 *  RFC1918 / CGNAT / 公网单播 / ULA 保留：自托管 LAN 部署里合法浏览器的 host
 *  候选就是私网地址，一并拒绝会让整条 WebRTC 路径退化到兼容传输。 */
export function isAcceptableRemoteIceCandidate(address: string, port: number): boolean {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const family = isIP(address);
  if (family === 4) return isAcceptableRemoteIpv4(address);
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(.+)$/);
    // 点分十进制映射按内嵌 IPv4 判定；十六进制映射形式（极罕见）按不可达拒收。
    if (mapped) return isIP(mapped[1]!) === 4 ? isAcceptableRemoteIpv4(mapped[1]!) : false;
    return !isSpecialIpv6(address.toLowerCase());
  }
  return false;
}

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
