const FIXED_SERVER_PASSWORD_KEY = "webspeak:fixed-server-password";

/** fixed（仅限此 TeamSpeak 服务器）模式的记忆密码存储。
 *
 *  open 模式的密码记忆借「连接即收藏」落在收藏条目里；fixed 模式的真实目标
 *  不下发（serverHost 只是网关主机回落值），历史上靠一条网关主机名的收藏
 *  条目当键——那条目既显示在 rail 上又误导，故独立成键，语义为「上一次
 *  成功连接所用的密码」（无需密码的连接写入空串，冲掉陈旧值）。
 *  清空随 clearBrowserData 的 webspeak:* 命名空间清扫自动覆盖。 */

export function readFixedServerPassword(): string {
  try {
    return localStorage.getItem(FIXED_SERVER_PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveFixedServerPassword(password: string): void {
  try {
    localStorage.setItem(FIXED_SERVER_PASSWORD_KEY, password);
  } catch { /* 存储不可用只影响下次记忆，不阻塞当前会话 */ }
}
