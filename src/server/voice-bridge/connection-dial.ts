import { TSClient } from "../ts-client.js";

/** 首连与重连共用的拨号上限：黑洞主机不再拖满系统级 TCP 超时（20s+），
 *  失败在 8 秒内浮出，重试节奏（1/2/4s 三轮）才有意义。 */
const CONNECT_TIMEOUT_MS = 8_000;

/** 拨号包裹超时：超时分支里 SDK 的拨号仍在后台挂着，显式断开它，
 *  避免下一次尝试叠在幽灵连接上。 */
export async function connectWithDialTimeout(tsClient: TSClient): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  try {
    await Promise.race([
      tsClient.connect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`TeamSpeak connect did not complete within ${CONNECT_TIMEOUT_MS / 1000}s`));
        }, CONNECT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (timedOut) void tsClient.disconnect().catch(() => undefined);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
