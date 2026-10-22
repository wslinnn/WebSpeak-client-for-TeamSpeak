import { useEffect, useState } from "react";

/** 粗指针（无悬停能力）信号：触屏/笔输入设备上悬停面板必须以点按开合替代
 * hover。与 useIsMobileViewport 同源 matchMedia 模式——宽屏触屏平板同样命中
 * （hover:none 与视口宽窄正交）。 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => window.matchMedia("(hover: none)").matches);
  useEffect(() => {
    const media = window.matchMedia("(hover: none)");
    const update = () => setCoarse(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return coarse;
}
