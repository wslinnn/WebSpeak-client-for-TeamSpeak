import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./services/theme";
import { installUiScale } from "./app/ui-scale";
import "./index.css";
import App from "./App.tsx";

// 首渲染前生效（避免主题闪烁）：theme 副作用应用已存主题 + ui-scale 钉 --ui-scale。
installUiScale();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
