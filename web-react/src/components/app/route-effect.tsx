import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// SPEC §1 平价：`html[data-ws-route]` ∈ {webclient, download, admin}，路由切换副作用设置——
// 文档级 CSS 门控依赖它（路由加载后 CSS 常驻），React 版等价实现。
export function RouteEffect() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.documentElement.dataset.wsRoute = pathname.startsWith("/admin")
      ? "admin"
      : pathname === "/download"
        ? "download"
        : "webclient";
  }, [pathname]);
  return null;
}
