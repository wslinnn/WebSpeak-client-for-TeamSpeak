/**
 * TeamSpeak query escaping for command arguments built by the gateway.
 *
 * Two copies of this function used to live in `ts-client.ts` and
 * `screen-share-coordinator.ts` and had already drifted once; keep a single
 * implementation next to the other security helpers. Beyond the four escapes
 * the query protocol defines, the remaining control characters are escaped with
 * the same backslash-letter convention (\n, \r were already handled) so a
 * hostile nickname, away message or screen-share argument cannot inject
 * additional `key=value` pairs or whole commands into the wire line.
 */
export function escapeTeamSpeakValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "\\s")
    .replace(/\//g, "\\/")
    .replace(/\|/g, "\\p")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/\v/g, "\\v");
}
