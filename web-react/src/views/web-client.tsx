import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/services/theme";

// WebClient 占位壳（Phase 4 步 3/4 换实体）。属性钩子从第一行 JSX 起就带（DECISIONS #2）：
// `ws-skin-root` 是皮肤 CSS 作用域锚点，`data-ws-page` 两态（home|voice）切换随实体实现落地。
export default function WebClient() {
  useEffect(() => {
    // Phase 4-7 皮肤运行时接线前，挂载后补一次 applyTheme：
    // 内置皮肤 CSS 作用域钉在 .ws-skin-root[data-ws-skin=…] 上，挂载前根元素尚不存在。
    applyTheme(getStoredTheme());
  }, []);
  return (
    <div className="web-client ws-skin-root min-h-dvh" data-ws-page="home">
      <p className="p-6 text-lg">WebSpeak</p>
    </div>
  );
}
