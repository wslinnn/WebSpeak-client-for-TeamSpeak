import { Writable } from "node:stream";
import { Client as TS3FullClient } from "@echosixhiya/teamspeak-client";
import type { TSClientAvatar } from "./ts-client.js";

// Keep enough room for avatars produced by the native client. The previous
// 120 KiB limit rejected the 134 KiB PNG used by the Shanghai test account,
// so every avatar silently fell back to its initial letter.
const MAX_CLIENT_AVATAR_BYTES = 256 * 1024;

/**
 * Load a visible client's TeamSpeak avatar through the client protocol.
 *
 * TeamSpeak does not include the avatar bytes in directory notifications.
 * `clientinfo` exposes the avatar marker and the per-identity filename; the
 * file itself is then read through the normal TeamSpeak file-transfer port.
 * A missing permission, missing avatar, blocked file-transfer port, or an
 * oversized image is intentionally reported as `null` so the web client can
 * keep its generated initial avatar.
 *
 * `isCurrent` must report whether this SDK client is still the owning
 * session's live client at the same connection generation; every stage
 * re-checks it so a superseded connection never emits stale avatar bytes.
 */
export async function fetchTeamSpeakClientAvatar(
  client: TS3FullClient,
  host: string,
  clientId: number,
  expectedUid: string,
  isCurrent: () => boolean,
): Promise<TSClientAvatar | null> {
  const rows = await client.execCommandWithResponse(`clientinfo clid=${clientId}`, 5_000);
  if (!isCurrent()) return null;
  const info = rows.find((row) => {
    if (expectedUid && row.client_unique_identifier !== expectedUid) return false;
    return typeof row.client_flag_avatar === "string" && typeof row.client_base64HashClientUID === "string";
  });
  if (!info) return null;
  const cacheKey = info.client_flag_avatar?.trim() ?? "";
  const avatarFileKey = info.client_base64HashClientUID?.trim() ?? "";
  if (!cacheKey || !/^[A-Za-z0-9+/=_-]{8,256}$/.test(avatarFileKey)) return null;

  const transfer = await client.fileTransferInitDownload(0n, `/avatar_${avatarFileKey}`, "");
  if (!isCurrent()) return null;
  const size = Number(transfer.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_CLIENT_AVATAR_BYTES) return null;

  const chunks: Buffer[] = [];
  const destination = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  await client.downloadFileData(host, transfer, destination);
  if (!isCurrent()) return null;
  const data = Buffer.concat(chunks);
  if (data.length === 0 || data.length > MAX_CLIENT_AVATAR_BYTES) return null;
  return { cacheKey, data };
}
