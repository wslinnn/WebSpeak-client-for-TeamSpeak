import { isIP } from "node:net";

/**
 * Misconfiguration signal for the reverse-proxy setup: loopback proxy trust
 * is on by default, so this only fires after an operator explicitly disabled
 * it (`WEBSPEAK_TRUST_PROXY=0`) — forwarded headers are then ignored by
 * design, and a same-host proxy renders every client as 127.0.0.1 in logs and
 * collapses all visitors into one rate-limit bucket. Nothing else surfaces
 * that degradation, hence this one-shot hint.
 */

const HINT = "Requests arrive from a loopback peer carrying X-Forwarded-For while WEBSPEAK_TRUST_PROXY is disabled: logs and rate limits see the proxy address instead of real clients. Running behind a same-host reverse proxy? Leave WEBSPEAK_TRUST_PROXY unset (loopback is trusted by default) or remove the explicit disable.";

export function isLoopbackAddress(value: string | undefined): boolean {
  if (!value) return false;
  let trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) trimmed = trimmed.slice(1, -1);
  if (trimmed.toLowerCase().startsWith("::ffff:")) trimmed = trimmed.slice("::ffff:".length);
  const address = trimmed.split("%")[0]!.toLowerCase();
  return address === "127.0.0.1" || address === "::1";
}

export function firstForwardedAddress(forwardedFor: string | string[] | undefined): string | null {
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const first = header?.split(",", 1)[0]?.trim() ?? "";
  return isIP(first) ? first : null;
}

/** Build the one-shot detector: it fires when a loopback peer delivers a
 *  syntactically valid X-Forwarded-For and stays silent afterwards. */
export function createProxyHint(hint: (message: string) => void): (remoteAddress: string | undefined, forwardedFor: string | string[] | undefined) => void {
  let hinted = false;
  return (remoteAddress, forwardedFor) => {
    if (hinted) return;
    const forwarded = firstForwardedAddress(forwardedFor);
    if (!forwarded || !isLoopbackAddress(remoteAddress)) return;
    hinted = true;
    hint(HINT);
  };
}
