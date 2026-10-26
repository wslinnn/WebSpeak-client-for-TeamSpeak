import { createSocket, type RemoteInfo, type Socket } from "node:dgram";
import { isIP } from "node:net";
import { rateLimitPeerKey } from "./client-ip.js";
import type { Logger } from "../logger.js";

/** Minimal RFC 8489 STUN server: binding requests only, no relay semantics.
 *
 *  Screen share peers are browsers behind home NATs; the default ICE list
 *  used to depend on TeamSpeak's foreign public STUN, which is frequently
 *  unreachable from CN networks — leaving only host candidates and therefore
 *  same-LAN-only video. The gateway already requires a publicly reachable
 *  UDP presence for voice, so it can answer STUN bindings itself: a STUN
 *  response carries a few dozen bytes and never touches media.
 */

const MAGIC_COOKIE = 0x2112_a444;
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const ATTR_XOR_MAPPED_ADDRESS = 0x0020;
const HEADER_BYTES = 20;
const IPV4_BYTES = 4;
const IPV6_BYTES = 16;

/** Per-peer token bucket: STUN answers are tiny but an open responder should
 *  still not amplify arbitrary traffic. Silently drop when exhausted — a
 *  lost binding reply just costs the peer one ICE restart. */
const RATE_BUCKET_CAPACITY = 30;
const RATE_REFILL_PER_SECOND = 15;
const RATE_SWEEP_INTERVAL_MS = 60_000;

export interface StunServerOptions {
  port: number;
  host?: string;
  logger: Logger;
}

interface RateBucket {
  tokens: number;
  refilledAt: number;
}

interface StunRateLimiter {
  allow(key: string): boolean;
  sweep(): void;
}

export function createStunRateLimiter(now: () => number = Date.now): StunRateLimiter {
  const buckets = new Map<string, RateBucket>();
  return {
    allow(key: string): boolean {
      const timestamp = now();
      const bucket = buckets.get(key) ?? { tokens: RATE_BUCKET_CAPACITY, refilledAt: timestamp };
      const elapsedSeconds = (timestamp - bucket.refilledAt) / 1000;
      bucket.tokens = Math.min(RATE_BUCKET_CAPACITY, bucket.tokens + elapsedSeconds * RATE_REFILL_PER_SECOND);
      bucket.refilledAt = timestamp;
      if (bucket.tokens < 1) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return true;
    },
    sweep(): void {
      const timestamp = now();
      for (const [key, bucket] of buckets) {
        if (timestamp - bucket.refilledAt > RATE_SWEEP_INTERVAL_MS) buckets.delete(key);
      }
    },
  };
}

/** Pure datagram handler: returns the reply bytes for a binding request or
 *  null for anything else (wrong type, short frame, foreign magic cookie,
 *  exhausted rate bucket). Socket-free for direct unit testing. */
export function handleStunDatagram(
  message: Buffer,
  remote: { address: string; port: number },
  allow: (remoteKey: string) => boolean,
): Buffer | null {
  if (message.length < HEADER_BYTES) return null;
  if (message.readUInt16BE(0) !== BINDING_REQUEST) return null;
  if (message.readUInt32BE(4) !== MAGIC_COOKIE) return null;
  const family = isIP(remote.address);
  if (family !== 4 && family !== 6) return null;
  if (!allow(rateLimitPeerKey(remote.address))) return null;
  // Attributes beyond the header are not validated: the binding response only
  // needs the 12-byte transaction id echoed back.
  const transactionId = message.subarray(8, 20);
  const addressBytes = family === 6 ? IPV6_BYTES : IPV4_BYTES;
  const attributeLength = 4 + addressBytes;
  const responseLength = 4 + attributeLength;

  const response = Buffer.alloc(HEADER_BYTES + responseLength);
  response.writeUInt16BE(BINDING_SUCCESS, 0);
  response.writeUInt16BE(responseLength, 2);
  message.copy(response, 4, 4, 8);
  transactionId.copy(response, 8);

  response.writeUInt16BE(ATTR_XOR_MAPPED_ADDRESS, HEADER_BYTES);
  response.writeUInt16BE(attributeLength, HEADER_BYTES + 2);
  response.writeUInt8(0, HEADER_BYTES + 4);
  response.writeUInt8(family === 6 ? 0x02 : 0x01, HEADER_BYTES + 5);
  response.writeUInt16BE(remote.port ^ (MAGIC_COOKIE >>> 16), HEADER_BYTES + 6);
  const addressBytesOut = addressBytesFromText(remote.address, family === 6 ? 6 : 4);
  for (let index = 0; index < addressBytes; index++) {
    // IPv4 unmasks with the magic cookie; IPv6 with cookie + transaction id
    // (RFC 8489 §14.2). The key bytes are read back from the response header
    // where both values already live.
    const keyOffset = index < IPV4_BYTES
      ? 4 + index
      : index < IPV4_BYTES + 12
        ? 8 + index - IPV4_BYTES
        : 4 + index - (IPV4_BYTES + 12);
    response[HEADER_BYTES + 8 + index] = addressBytesOut[index]! ^ response[keyOffset]!;
  }
  return response;
}

function addressBytesFromText(address: string, family: 4 | 6): Uint8Array {
  // node parses textual addresses; reuse dgram's own packing via a scratch
  // socket is overkill, so map IPv4 by hand and let node:dns-free IPv6 text
  // forms pass through the standard parser.
  if (family === 4) {
    const parts = address.split(".");
    const bytes = new Uint8Array(IPV4_BYTES);
    for (let index = 0; index < IPV4_BYTES; index++) bytes[index] = Number(parts[index]);
    return bytes;
  }
  const bytes = new Uint8Array(IPV6_BYTES);
  const [head, tail = ""] = address.replace(/^\[|\]$/g, "").split("::", 2);
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const padding = IPV6_BYTES / 2 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array(Math.max(0, padding)).fill("0"), ...tailGroups];
  for (let index = 0; index < IPV6_BYTES / 2; index++) {
    const value = parseInt(groups[index] || "0", 16);
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}

export interface RunningStunServer {
  close(): Promise<void>;
}

export function startStunServer(options: StunServerOptions): Promise<RunningStunServer | null> {
  if (!Number.isInteger(options.port) || options.port <= 0) return Promise.resolve(null);
  const limiter = createStunRateLimiter();
  const sockets: Socket[] = [];
  const sweepTimer = setInterval(() => limiter.sweep(), RATE_SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
  const listen = (family: 4 | 6): Promise<Socket | null> => new Promise((resolve) => {
    const socket = createSocket(family === 4 ? "udp4" : "udp6");
    socket.once("error", (error: NodeJS.ErrnoException) => {
      options.logger.warn(`STUN ${family === 4 ? "IPv4" : "IPv6"} listener unavailable: ${error.message}`);
      try { socket.close(); } catch { /* never bound */ }
      resolve(null);
    });
    socket.on("message", (message: Buffer, remote: RemoteInfo) => {
      const reply = handleStunDatagram(message, { address: remote.address, port: remote.port }, (key) => limiter.allow(key));
      if (reply) socket.send(reply, remote.port, remote.address);
    });
    socket.bind(options.port, options.host, () => resolve(socket));
  });

  return (async () => {
    const ipv4 = await listen(4);
    const ipv6 = await listen(6);
    if (!ipv4 && !ipv6) {
      clearInterval(sweepTimer);
      options.logger.warn(`STUN service disabled: UDP port ${options.port} unavailable`);
      return null;
    }
    for (const socket of [ipv4, ipv6]) if (socket) sockets.push(socket);
    options.logger.info(`STUN service ready at udp://${options.host || "*"}:${options.port}`);
    return {
      close: () => new Promise<void>((resolve) => {
        clearInterval(sweepTimer);
        let pending = sockets.length;
        if (!pending) {
          resolve();
          return;
        }
        for (const socket of sockets) {
          socket.once("close", () => {
            pending -= 1;
            if (pending === 0) resolve();
          });
          socket.close();
        }
      }),
    };
  })();
}
