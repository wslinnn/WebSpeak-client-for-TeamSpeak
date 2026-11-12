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

/**
 * WebSocket upgrade 的同源判定。浏览器一定会发 `Origin`，跨源
 * 升级必须拒绝；非浏览器客户端（冒烟脚本、诊断工具）不发这个头，它们由一次性
 * join ticket 兜底，因此缺头放行。
 *
 * 注意这仍是「防跨源」，不是「防 DNS rebinding」：攻击者页面以 evil.com 访问
 * 被重绑到网关 IP 时 Origin 与 Host 依旧一致。部署侧必须把网关放在受信网络
 * （见 README 的部署安全边界）。
 */
export function isAllowedUpgradeOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
