import { describe, expect, it } from "vitest";

import { createHomeStore } from "./home-store";
import { createIdentityPersistence } from "./identity-persistence";

function setup() {
  const store = createHomeStore();
  const saved: string[] = [];
  const removed: number[] = [];
  const persistence = createIdentityPersistence({
    store,
    saveStoredIdentity: async (material) => { saved.push(material); },
    removeStoredIdentity: async () => { removed.push(1); },
  });
  return { store, saved, removed, persistence };
}

describe("createIdentityPersistence", () => {
  it("toggling remember writes the flag and clearing drops stored identity once", async () => {
    const { store, saved, removed } = setup();
    store.setState({ rememberIdentity: true });
    expect(localStorage.getItem("webspeak:remember-identity")).toBe("1");
    store.setState({ identityMaterial: "material-a" });
    // 微任务落地：保存被调用一次
    await Promise.resolve();
    expect(saved).toEqual(["material-a"]);
    store.setState({ rememberIdentity: false });
    expect(localStorage.getItem("webspeak:remember-identity")).toBe("0");
    expect(store.getState().identityMaterial).toBe("");
    await Promise.resolve();
    expect(removed).toHaveLength(1);
  });

  it("a reentrant clearing does not resave the old material", async () => {
    const { store, saved } = setup();
    store.setState({ rememberIdentity: true, identityMaterial: "material-b" });
    await Promise.resolve();
    expect(saved).toEqual(["material-b"]);
    // 取消记住触发内层清空；外层快照已过期，不得把旧材料再存一遍。
    store.setState({ rememberIdentity: false });
    await Promise.resolve();
    expect(saved).toEqual(["material-b"]);
    expect(store.getState().identityMaterial).toBe("");
  });

  it("identity changes while remembered persist; unremembered materials are not saved", async () => {
    const { store, saved } = setup();
    store.setState({ identityMaterial: "forgotten" });
    await Promise.resolve();
    expect(saved).toEqual([]);
    store.setState({ rememberIdentity: true });
    store.setState({ identityMaterial: "kept" });
    await Promise.resolve();
    expect(saved).toEqual(["kept"]);
  });
});
