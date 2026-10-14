import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/app/error-boundary";
import { ConfirmDialogHost } from "./components/app/confirm-host";
import { RouteEffect } from "./components/app/route-effect";
import { Toaster } from "@/components/ui/sonner";

const WebClient = lazy(() => import("./views/web-client"));
const DownloadView = lazy(() => import("./views/download-view"));
const AdminView = lazy(() => import("./views/admin-view"));

// 路由面与旧版一致（SPEC §1）：/、/join → WebClient；/download → DownloadView；/admin/* → AdminView。
// data-ws-route 副作用在 RouteEffect；全局层（确认弹窗/toast）在 Router 之外、两态分支之外。
export function AppRoutes() {
  return (
    <>
      <RouteEffect />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<WebClient />} />
          <Route path="/join" element={<WebClient />} />
          <Route path="/download" element={<DownloadView />} />
          <Route path="/admin/*" element={<AdminView />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <ConfirmDialogHost />
      <Toaster />
    </ErrorBoundary>
  );
}
