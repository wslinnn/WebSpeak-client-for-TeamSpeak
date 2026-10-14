import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/services/theme";

// DownloadView 占位壳（Phase 4 步 1 换实体）。公开页与 WebClient 同属皮肤作用域根。
export default function DownloadView() {
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);
  return (
    <div className="download-page ws-skin-root min-h-dvh">
      <p className="p-6 text-lg">Download</p>
    </div>
  );
}
