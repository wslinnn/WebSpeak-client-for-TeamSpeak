/**
 * TeamSpeak query escaping for command arguments built by the gateway.
 *
 * Two copies of this function used to live in `ts-client.ts` and
 * `screen-share-coordinator.ts` and had already drifted once; keep a single
 * implementation next to the other security helpers. The escape table mirrors
 * the vendored SDK's command encoder one-to-one (报告 21 S6：\a/\b 之前缺失，
 * 属协议一致性缺口) so a hostile nickname, away message or screen-share
 * argument cannot inject additional `key=value` pairs or whole commands into
 * the wire line.
 */
export function escapeTeamSpeakValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/ /g, "\\s")
    .replace(/\//g, "\\/")
    .replace(/\|/g, "\\p")
    .replace(/\x07/g, "\\a")
    .replace(/\x08/g, "\\b")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\f/g, "\\f")
    .replace(/\v/g, "\\v");
}
