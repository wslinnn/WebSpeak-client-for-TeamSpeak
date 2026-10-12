import { createHash, createHmac, randomBytes } from "node:crypto";
import { AvatarLruCache, type AvatarEntry } from "./avatar-cache.js";

// Every avatar is relayed from this cache to any number of browsers; oversized
// files (TeamSpeak allows several MB) would let one member's image eat the
// shared 3 Mbit/s uplink per viewer, so they are refused like failed transfers.
export const MAX_AVATAR_BYTES = 256 * 1024;

const AID_HEX_LENGTH = 32; // 128 bits — the capability id stays unguessable
const HASH_HEX_LENGTH = 16;

function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.length >= 6 && (data.subarray(0, 6).toString("ascii") === "GIF87a" || data.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/**
 * Capability-URL avatar publication. The gateway hands browsers URLs, not
 * bytes: `/avatars/<aid>?v=<hash>` — `aid` is an HMAC of the TeamSpeak uid
 * under a per-process secret, so the URL is the credential (unguessable,
 * never expires) and stays byte-stable across refreshes, resumes and
 * reconnects; `v` is a content hash that changes only when the image does,
 * keeping the browser's HTTP cache key stable. Browsers fetch the bytes
 * through their own cache, so re-attachments cost a tiny idempotent message
 * instead of re-pumping every image over the 3 Mbit/s uplink.
 */
export class AvatarService {
  constructor(private readonly cache: AvatarLruCache, private readonly secret: Buffer = randomBytes(32)) {}

  /** Opaque, stable-per-secret cache key for a TeamSpeak identity. */
  aid(uid: string): string {
    return createHmac("sha256", this.secret).update(uid).digest("hex").slice(0, AID_HEX_LENGTH);
  }

  /** Capability URL for a cached avatar; null when this uid has no bytes. */
  url(uid: string): string | null {
    const aid = this.aid(uid);
    const entry = this.cache.get(aid);
    return entry ? `/avatars/${aid}?v=${entry.hash}` : null;
  }

  /** Validates, hashes and caches downloaded bytes; false rejects unusable
   *  images so the loader treats them like absences. */
  store(uid: string, data: Buffer): boolean {
    if (data.length === 0 || data.length > MAX_AVATAR_BYTES) return false;
    const mime = sniffImageMime(data);
    if (!mime) return false;
    const hash = createHash("sha256").update(data).digest("hex").slice(0, HASH_HEX_LENGTH);
    this.cache.set(this.aid(uid), { data, mime, hash });
    return true;
  }

  /** HTTP lookup by capability id; unknown or malformed ids miss. */
  serve(aid: string): AvatarEntry | null {
    if (!/^[0-9a-f]{32}$/.test(aid)) return null;
    return this.cache.get(aid) ?? null;
  }

  get size(): number {
    return this.cache.size;
  }
}
