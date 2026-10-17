import type { Request } from "express";

/**
 * Origin/Host 同源判定，供需要「浏览器同源才收」的 POST 端点复用
 * （join-ticket 与 /_rtp-lab 信令；报告 21 S7）。跨源请求一律拒绝：
 * 端点本身匿名，同源是防 CSRF 式滥用的最低门槛。
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.header("origin");
  const host = request.header("host");
  try {
    return Boolean(origin && host && new URL(origin).host === host);
  } catch {
    return false;
  }
}
