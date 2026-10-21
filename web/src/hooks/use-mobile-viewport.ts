import { useEffect, useState } from "react";

/** ≤740 移动布局带信号（与 views/web-client.tsx 的 matchMedia 同源；新消费方走本
 *  hook，web-client.tsx 自持状态待后续收口）。 */
export function useIsMobileViewport(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 740px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 740px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}
