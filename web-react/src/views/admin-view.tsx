// AdminView 占位壳（Phase 4 步 2 换实体）。
// 红线（SPEC §10）：admin 视图/组件不得含 `ws-skin-root`/`data-ws-page`——
// 管理台外观只跟 html[data-theme]，不吃皮肤 CSS。
export default function AdminView() {
  return (
    <div className="app-shell min-h-dvh">
      <p className="p-6 text-md">Admin</p>
    </div>
  );
}
