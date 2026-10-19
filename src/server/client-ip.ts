import { BlockList, isIP } from "node:net";

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

// A reverse proxy on the same host reaches us over loopback, which is also what
// the published host-network container sees. Anything else has to be declared,
// because whoever we believe can choose the address we record.
const DEFAULT_TRUSTED_PROXIES = ["127.0.0.1", "::1"] as const;

/** Matcher with nothing in it: every peer is untrusted, so forwarded headers
 *  are ignored. Used when the operator has not declared a reverse proxy. */
export const NO_TRUSTED_PROXIES: BlockList = new BlockList();

/**
 * Build the matcher that decides whether forwarding headers may be believed.
 * Entries are IPs or CIDRs; an invalid entry throws instead of silently
 * narrowing what is trusted.
 */
export function createTrustedProxies(entries: readonly string[] | undefined): BlockList {
  const list = new BlockList();
  const effective = entries?.length ? entries : DEFAULT_TRUSTED_PROXIES;
  for (const entry of effective) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("/");
    const address = normalizeSocketAddress(separator === -1 ? trimmed : trimmed.slice(0, separator));
    const family = address ? isIP(address) : 0;
    if (!address || (family !== 4 && family !== 6)) {
      throw new Error(`Invalid WEBSPEAK_TRUSTED_PROXIES entry: ${entry}`);
    }
    if (separator === -1) {
      list.addAddress(address, family === 4 ? "ipv4" : "ipv6");
      continue;
    }
    const prefixText = trimmed.slice(separator + 1);
    const prefix = Number(prefixText);
    if (!/^\d+$/.test(prefixText) || prefix > (family === 4 ? 32 : 128)) {
      throw new Error(`Invalid WEBSPEAK_TRUSTED_PROXIES prefix: ${entry}`);
    }
    list.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
  }
  return list;
}

/** Operator configuration. `WEBSPEAK_TRUST_PROXY` declares the same-host
 *  reverse proxy (loopback), `WEBSPEAK_TRUSTED_PROXIES` names any other proxy.
 *  Neither means forwarded headers are ignored, which is the documented
 *  default for a directly exposed gateway. */
export function createConfiguredTrustedProxies(options: {
  trustProxy?: boolean;
  entries?: readonly string[] | undefined;
}): BlockList {
  if (options.entries?.length) return createTrustedProxies(options.entries);
  if (options.trustProxy === true) return createTrustedProxies(undefined);
  return NO_TRUSTED_PROXIES;
}

function isTrustedProxy(address: string, trustedProxies: BlockList): boolean {
  const family = isIP(address);
  if (family !== 4 && family !== 6) return false;
  try {
    return trustedProxies.check(address, family === 4 ? "ipv4" : "ipv6");
  } catch {
    return false;
  }
}

/** Whether this peer itself is a declared proxy, i.e. whether any forwarding
 *  header it sent may be believed. Mapped IPv4 forms are normalized first so a
 *  dual-stack socket matches an IPv4 entry. */
export function isTrustedProxyPeer(remoteAddress: string | undefined, trustedProxies: BlockList): boolean {
  const address = normalizeSocketAddress(remoteAddress);
  return address !== undefined && isTrustedProxy(address, trustedProxies);
}

/**
 * Resolve the client IP for logging and limiter keys.
 *
 * Forwarding headers are believed only when the peer that sent them is a
 * declared proxy: every visitor can set them on the upgrade request, so
 * without this check the recorded address would be chosen by the client.
 * `X-Forwarded-For` is append-only, so a trusted chain is walked from the hop
 * nearest to us towards the client and the first untrusted address is
 * reported — a value a client injected to the left of its proxy's entry is
 * never recorded. `X-Real-IP` is used only for a trusted peer that sent no
 * chain: a proxy appends to `X-Forwarded-For`, whereas `X-Real-IP` is only as
 * good as the proxy configuration.
 */
export function resolveClientAddress(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedProxies: BlockList,
  realIp?: string | string[] | undefined,
): string {
  const direct = normalizeSocketAddress(remoteAddress);
  if (!direct || !isTrustedProxy(direct, trustedProxies)) return direct ?? "unknown";

  const header = Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor;
  const hops: string[] = [];
  if (header) {
    for (const candidate of header.split(",")) {
      const hop = normalizeSocketAddress(candidate);
      if (hop) hops.push(hop);
    }
    hops.reverse();
  }
  for (const hop of hops) {
    if (!isTrustedProxy(hop, trustedProxies)) return hop;
  }
  if (!hops.length) {
    // A single-hop proxy may be configured to send only X-Real-IP.
    const realAddress = normalizeSocketAddress(Array.isArray(realIp) ? realIp[0] : realIp);
    if (realAddress && !isTrustedProxy(realAddress, trustedProxies)) return realAddress;
  }
  // Every address we can see belongs to a proxy we trust. Report the furthest
  // one instead of inventing a client address that was never forwarded.
  return hops.length ? hops[hops.length - 1]! : direct;
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
