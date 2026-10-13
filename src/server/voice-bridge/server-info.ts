export interface TeamSpeakServerInfo {
  name?: string;
  welcomeMessage?: string;
}

const clamp = (value: string | undefined, max: number): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

/** `serverinfo` response row → the two fields the browser welcome card shows.
 *  The SDK's command parser already undid TS3 query escaping; both fields are
 *  optional and clamped, and the card is simply absent when neither exists. */
export function parseServerInfoRow(row: Record<string, string> | undefined): TeamSpeakServerInfo | null {
  if (!row) return null;
  const info: TeamSpeakServerInfo = {
    name: clamp(row.virtualserver_name, 160),
    welcomeMessage: clamp(row.virtualserver_welcomemessage, 1024),
  };
  return info.name || info.welcomeMessage ? info : null;
}
