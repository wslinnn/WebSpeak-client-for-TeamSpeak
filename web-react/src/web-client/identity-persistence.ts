import type { StoreApi } from "zustand";

import type { HomeStore } from "./home-store";

interface Options {
  store: StoreApi<HomeStore>;
  // 真实服务返回 Promise<boolean>（label 参数省略）；测试桩返回 Promise<void>，二者皆收。
  saveStoredIdentity(material: string): Promise<boolean | void>;
  removeStoredIdentity(): Promise<boolean | void>;
}

/** 记住身份的持久化订阅（旧 WebClient.vue 两条 watch 的平价）：
 *  rememberIdentity 翻转写 localStorage 旗标，取消记住时清空在存身份；
 *  记住状态下新身份材料落 IndexedDB。订阅内 setState 的重入以「先记账后落库」
 *  消化：清空动作把镜像 lastMaterial 先置 ""，重入调用看到已同步即跳过。 */
export function createIdentityPersistence(options: Options) {
  let lastRemember = options.store.getState().rememberIdentity;
  let lastMaterial = options.store.getState().identityMaterial;
  const unsubscribe = options.store.subscribe((snapshot) => {
    const rememberChanged = snapshot.rememberIdentity !== lastRemember;
    lastRemember = snapshot.rememberIdentity;
    const materialChanged = snapshot.identityMaterial !== lastMaterial;
    lastMaterial = snapshot.identityMaterial;
    if (rememberChanged) {
      try {
        localStorage.setItem("webspeak:remember-identity", snapshot.rememberIdentity ? "1" : "0");
      } catch {
        // 隐私模式写不进旗标：会话内语义照旧，刷新后回到默认记住。
      }
    }
    if (rememberChanged && !snapshot.rememberIdentity && snapshot.identityMaterial) {
      lastMaterial = "";
      options.store.setState({ identityMaterial: "" });
      void options.removeStoredIdentity();
      return;
    }
    if (materialChanged && snapshot.identityMaterial && snapshot.rememberIdentity) {
      void options.saveStoredIdentity(snapshot.identityMaterial);
    }
  });
  return { dispose: unsubscribe };
}

export type IdentityPersistence = ReturnType<typeof createIdentityPersistence>;
