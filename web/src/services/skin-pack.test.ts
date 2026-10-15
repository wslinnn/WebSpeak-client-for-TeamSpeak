import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// jsdom 的全局 URL 以页面地址为基准解析 file: 基准会失败；文件路径解析必须用 node 版。
import { URL as NodeURL } from "node:url";
import { test } from "vitest";
import { strToU8, zipSync } from "fflate";
import { importSkinPack, resolveSkinCssAssets, SkinPackError } from "./skin-pack";
import { scopeBuiltinThemeForCustomSkin } from "./skin-cascade";

const manifest = {
  schemaVersion: 1,
  id: "ocean-night",
  name: "Ocean Night",
  version: "1.0.0",
  author: "WebSpeak test",
  license: "MIT",
  minAppVersion: "0.2.4",
  entry: "skin.css",
};

test("skin CSS is scoped, local artwork and fonts work, and global names are isolated", async () => {
  const skin = await importSkinPack(makeSkin(`
    @font-face { font-family: "Wave Font"; src: url("assets/wave.woff2") format("woff2"); }
    @keyframes shimmer { from { opacity: .4; } to { opacity: 1; } }
    :root { --skin-accent: #00a99d; }
    [data-ws-part="voice.member"] { font-family: "Wave Font", sans-serif; animation: shimmer 1s ease-in-out; background-image: image-set("assets/backdrop.png" 1x); }
  `));

  assert.match(skin.css, /\.ws-skin-root\[data-ws-skin="ocean-night"\] \{ --skin-accent: #00a99d; \}/);
  assert.match(skin.css, /@keyframes ws-ocean-night-shimmer/);
  assert.match(skin.css, /animation: ws-ocean-night-shimmer/);
  assert.match(skin.css, /font-family: "ws-ocean-night-Wave-Font"/);
  assert.match(skin.css, /url\("wskin-asset:assets%2Fwave\.woff2"\)/);
  assert.match(skin.css, /image-set\("wskin-asset:assets%2Fbackdrop\.png" 1x\)/);
  assert.ok(skin.warnings.some((warning) => warning.includes("localized text wrapping")));
  assert.equal(skin.contentData, undefined, "skin content is optional; WebSpeak supplies the base interface translations");

  const resolved = resolveSkinCssAssets(skin.css, skin.assets);
  assert.match(resolved.css, /blob:/);
  resolved.objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

test("skin CSS permits visual decoration but prevents layout, text-flow, and control-geometry changes", async () => {
  const skin = await importSkinPack(makeSkin('@keyframes fade-wave { from { opacity: 0; } to { opacity: 1; } } [data-ws-part="home.join-card.waveform"] { opacity: var(--skin-decoration-opacity); animation: fade-wave 1s; box-shadow: 0 0 14px #4ff; }'));
  assert.match(skin.css, /opacity: var\(--skin-decoration-opacity\)/);
  assert.match(skin.css, /box-shadow: 0 0 14px #4ff/);
  assert.match(skin.css, /from \{ opacity: 0; \}/);
  assert.match(skin.css, /animation: ws-ocean-night-fade-wave 1s/);

  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { display: none; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { position: fixed; inset: 0; z-index: 99999; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.member"] { padding: 30px; transform: scale(1.2); }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home.hero.title"] { font-size: 3rem; line-height: 1; white-space: nowrap; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home.hero.title"] { text-transform: uppercase; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { opacity: 0; }')), (error: unknown) => error instanceof Error && error.message.includes("explicitly optional visual parts"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home.join-card.waveform"] span { display: none; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { display: var(--skin-hidden); }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="voice.screen-player.exit"] { all: unset; }')), (error: unknown) => error instanceof Error && error.message.includes("must not change layout"));
  await assert.rejects(importSkinPack(makeSkin('@keyframes hide-control { to { opacity: 0; } } [data-ws-part="voice.screen-player.exit"] { animation: hide-control 1s infinite; }')), (error: unknown) => error instanceof Error && error.message.includes("explicitly optional visual parts"));
  await assert.rejects(importSkinPack(makeSkin('@keyframes hide-control { to { opacity: 0; } } [data-ws-part="control"] { animation: var(--custom-animation); }')), (error: unknown) => error instanceof Error && error.message.includes("explicitly optional visual parts"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home"] { --accent: red; }')), (error: unknown) => error instanceof Error && error.message.includes("--skin- prefix"));
  await assert.rejects(importSkinPack(makeSkin(".internal-class { color: red; }")), (error: unknown) => error instanceof Error && error.message.includes("must use :root"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home.join-card.waveform"].private-component { color: red; }')), (error: unknown) => error instanceof Error && error.message.includes("must use :root"));
  await assert.rejects(importSkinPack(makeSkin('[data-ws-part="home"] { background-image: image-set("https://example.invalid/remote.png" 1x); }')), (error: unknown) => error instanceof SkinPackError && error.code === "SKIN_EXTERNAL_RESOURCE");
});

test("custom skins can override theme appearance without !important or private class selectors", () => {
  const css = '.ws-skin-root[data-ws-skin="builtin.dark"] .join-page .join-card { color: white; }';
  assert.equal(
    scopeBuiltinThemeForCustomSkin(css, "dark", "community.example"),
    ':where(.ws-skin-root[data-ws-skin="community.example"]) .join-page .join-card { color: white; }',
  );
});

test("community skins use a scoped light fallback instead of inheriting the night skin", async () => {
  const lightCss = await readFile(new NodeURL("../skins/builtin/light/skin.css", import.meta.url), "utf8");
  const scoped = scopeBuiltinThemeForCustomSkin(lightCss, "light", "community.example");
  assert.match(scoped, /:where\(\.ws-skin-root\[data-ws-skin="community\.example"\]\) \{\s*color-scheme: light;/);
  assert.match(scoped, /:where\(\.ws-skin-root\[data-ws-skin="community\.example"\]\) \.settings-content/);
});

test("skin content supports localized interface message overrides and includes the preview as an asset", async () => {
  const content = { defaultLocale: "en", locales: { en: { home: { title: "Welcome" }, messages: { speakingNow: "Live now" } } } };
  const skin = await importSkinPack(makeSkin('[data-ws-part="voice.member.avatar"] { background: url(assets/preview.png); }', content));
  assert.equal(skin.contentData?.locales.en?.messages?.speakingNow, "Live now");
  assert.equal(skin.previewBlob?.type, "image/png");
  assert.ok(skin.assets["assets/preview.png"]);
});

// The five legacy-anchored tests (documented parts vs. Vue sources, switcher
// token styling, artwork layering, chat empty state, homepage motion/spacing)
// stay in the legacy app's suite: their subjects are the old Vue sources and
// web-client.css. They are re-anchored to the new UI in Phases 3-4.

function makeSkin(css: string, content?: unknown): File {
  const packageFiles: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify({ ...manifest, ...(content ? { content: "content.json" } : {}), preview: "assets/preview.png" })),
    "skin.css": strToU8(css),
    "assets/backdrop.png": new Uint8Array([1, 2, 3, 4]),
    "assets/preview.png": new Uint8Array([5, 6, 7, 8]),
    "assets/wave.woff2": new Uint8Array([9, 10, 11, 12]),
  };
  if (content) packageFiles["content.json"] = strToU8(JSON.stringify(content));
  const bytes = zipSync(packageFiles);
  return new File([bytes.slice().buffer as ArrayBuffer], "skin.wskin", { type: "application/octet-stream" });
}
