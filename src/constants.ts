/** The HTTP port is part of the WebSpeak deployment contract. */
export const APP_PORT = 3040;

/** Hard safety ceiling for independently connected browser sessions. */
export const MAX_ACTIVE_SESSIONS = 100;

/** S3（报告 21）：单对端（NAT 出口 / IPv6 /64，复用 client-ip 的限流键）并发
 *  会话上限——没有它，一个对端约 4 分钟即可吃满全局 100 槽。正常家庭/小办公
 *  网远低于此值；重连续任者先 admit 后拆除，瞬时会 +1，余量足够。 */
export const MAX_SESSIONS_PER_PEER = 10;

export function canAcceptSession(activeSessionCount: number): boolean {
  return Number.isInteger(activeSessionCount) && activeSessionCount >= 0 && activeSessionCount < MAX_ACTIVE_SESSIONS;
}
