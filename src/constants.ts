/** The HTTP port is part of the WebSpeak deployment contract. WEBSPEAK_PORT
 *  overrides it for scratch local instances; the smoke suite binds 3041 with
 *  it so runs never contend with a dev gateway on 3040. */
export const APP_PORT = Number(process.env.WEBSPEAK_PORT?.trim() || "") || 3040;

/** Hard safety ceiling for independently connected browser sessions. */
export const MAX_ACTIVE_SESSIONS = 100;

/** S3（报告 21）：单对端（NAT 出口 / IPv6 /64，复用 client-ip 的限流键）并发
 *  会话上限——没有它，一个对端约 4 分钟即可吃满全局 100 槽。20 留出了「一个
 *  小办公室/家庭共用一条公网出口」的余量（10 会让第 11 个人被挡在门外），
 *  全局 100 仍是真正的容量闸门。重连续任者先 admit 后拆除，瞬时会 +1，余量
 *  足够。 */
export const MAX_SESSIONS_PER_PEER = 20;

export function canAcceptSession(activeSessionCount: number): boolean {
  return Number.isInteger(activeSessionCount) && activeSessionCount >= 0 && activeSessionCount < MAX_ACTIVE_SESSIONS;
}

/** Default WebRTC media port range used by WebSpeak and its Docker image.
 *  100 ports covered ~50 sessions at two sockets per session（报告 21 F2）:
 *  the default now covers the 100-session ceiling with an address margin.
 *  Lives beside the deployment constants so the persistence layer can default
 *  settings without reaching into the server layer. */
export const DEFAULT_WEBRTC_UDP_PORT_RANGE: [number, number] = [40000, 41999];
