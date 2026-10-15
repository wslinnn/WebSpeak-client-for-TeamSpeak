import { useEffect, useState } from "react";

/** 密码重试倒计时（旧 retryNowTick/retryTicker watch 平价）：只在真实退避窗口内
 *  跳秒；秒数单独 floor 到 1 的问题由 secondsShown 区分。tick 全部走定时器回调，
 *  effect 体内不直接 setState。 */
export function useRetryCountdown(retryNotUntil: number) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const waiting = retryNotUntil > nowTick;
  useEffect(() => {
    if (!waiting) return;
    const tick = () => setNowTick(Date.now());
    // lead 让倒计时立刻对齐当下（retryNotUntil 刚变更时 nowTick 可能是陈旧的），
    // 同时避开 effect 体内的同步 setState。
    const lead = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(lead);
      window.clearInterval(id);
    };
  }, [waiting]);
  const secondsLeft = Math.max(1, Math.ceil((retryNotUntil - nowTick) / 1000));
  return { waiting, secondsShown: waiting ? secondsLeft : 0 };
}
