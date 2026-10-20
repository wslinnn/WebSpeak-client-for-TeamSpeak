const UINT64_MAX = 18_446_744_073_709_551_615n;

function parseChannelId(value: string | undefined): bigint | null {
  if (value === undefined || !/^\d{1,20}$/.test(value)) return null;
  const id = BigInt(value);
  return id > UINT64_MAX ? null : id;
}

/** The password flag reveals whether a password is required, never the password itself. */
export function parseChannelPasswordProtection(row: Record<string, string>): boolean | null {
  if (row.channel_flag_password === "1") return true;
  if (row.channel_flag_password === "0") return false;
  return null;
}

export function parseChannelPasswordProtections(rows: readonly Record<string, string>[]): Map<bigint, boolean> {
  const protections = new Map<bigint, boolean>();
  for (const row of rows) {
    const id = parseChannelId(row.cid);
    const passwordProtected = parseChannelPasswordProtection(row);
    if (id === null || passwordProtected === null) continue;
    protections.set(id, passwordProtected);
  }
  return protections;
}

/** Tracks channel create/edit/delete notifications so the flag stays current
 *  for the lifetime of the session. Returns the change worth publishing. */
export function applyChannelPasswordFlagNotification(
  name: string,
  params: Record<string, string>,
  protections: Map<bigint, boolean>,
): { channelId: bigint; passwordProtected: boolean } | null {
  const id = parseChannelId(params.cid);
  if (id === null) return null;
  if (name === "notifychanneldeleted") {
    protections.delete(id);
    return null;
  }
  const passwordProtected = parseChannelPasswordProtection(params);
  if (passwordProtected === null) return null;
  protections.set(id, passwordProtected);
  return { channelId: id, passwordProtected };
}
