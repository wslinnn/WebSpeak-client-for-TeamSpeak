import { isIP } from "node:net";

/**
 * Peer key for rate limiting. Direct IPv6 clients can rotate an entire /64 for
 * free, so aggregate v6 addresses to /64; IPv4 scarcity needs no aggregation.
 * Behind a reverse proxy the resolved client IP feeds the same aggregation.
 */
export function rateLimitPeerKey(ip: string): string {
  const address = normalizeSocketAddress(ip);
  if (!address || isIP(address) !== 6) return address ?? ip;
  const expanded = expandIpv6(splitScopeId(address)[0]);
  if (!expanded) return address;
  const prefix = expanded.slice(0, 4).map((value) => value.toString(16)); // first 64 bits = 4 hextets
  return `${prefix.join(":")}::/64`;
}

/**
 * Resolve the client IP for logging and limiter keys.
 *
 * Forwarded headers are only consulted when the operator has declared a
 * trusted proxy (`WEBSPEAK_TRUST_PROXY`); otherwise they are attacker-
 * controlled and would poison both the logs and the rate-limit keys. The
 * first entry of `X-Forwarded-For` is what our own proxy appended for the
 * real client in the supported single-proxy deployment.
 */
export function resolveClientAddress(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const first = header?.split(",", 1)[0]?.trim();
    if (first && isIP(first)) return first;
  }
  return normalizeSocketAddress(remoteAddress) ?? "unknown";
}

/**
 * Node reports IPv4 peers on dual-stack sockets as `::ffff:a.b.c.d`; keep them
 * IPv4 so rate limiting cannot lump all v4 clients into one IPv6 /64 bucket.
 */
function normalizeSocketAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) trimmed = trimmed.slice(1, -1);
  if (trimmed.toLowerCase().startsWith("::ffff:")) {
    const mapped = trimmed.slice("::ffff:".length);
    if (isIP(mapped) === 4) trimmed = mapped;
  }
  return isIP(trimmed) ? trimmed : undefined;
}

function splitScopeId(ip: string): [string, string | undefined] {
  const percent = ip.indexOf("%");
  if (percent === -1) return [ip, undefined];
  return [ip.slice(0, percent), ip.slice(percent + 1)];
}

/** Expand an IPv6 literal to its 8-hextet form, or null when malformed. */
function expandIpv6(address: string): number[] | null {
  let head = address;
  let tail: string[] = [];
  const doubleColon = address.indexOf("::");
  if (doubleColon !== -1) {
    head = address.slice(0, doubleColon);
    const tailText = address.slice(doubleColon + 2);
    tail = tailText ? tailText.split(":") : [];
  }
  const headParts = head ? head.split(":") : [];
  if (doubleColon !== -1 && headParts.length + tail.length > 7) return null;
  const missing = 8 - headParts.length - tail.length;
  if (doubleColon !== -1 ? missing < 0 : missing !== 0) return null;
  const hextets = [...headParts, ...Array<string>(doubleColon === -1 ? 0 : missing).fill("0"), ...tail];
  if (hextets.length !== 8) return null;
  const values = hextets.map((hextet) => Number.parseInt(hextet, 16));
  return values.some((value) => !Number.isInteger(value) || Number.isNaN(value)) ? null : values;
}
