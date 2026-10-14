import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { importSkinPack, resolveSkinCssAssets, SkinPackError } from "./skin-pack.js";
import { scopeBuiltinThemeForCustomSkin } from "./skin-cascade.js";

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

// web-client.css is a pure ordered @import manifest (byte-invariant split, report
// 14 §3); rules live in the shards, so tests assert against the inlined cascade.
async function readWebClientCss(): Promise<string> {
  const entry = await readFile(new URL("../styles/web-client.css", import.meta.url), "utf8");
  const imports = [...entry.matchAll(/^@import "\.\/web-client\/([^"]+)";$/gm)].map(match => match[1]);
  if (imports.length === 0) return entry;
  const shards = await Promise.all(
    imports.map(name => readFile(new URL(`../styles/web-client/${name}`, import.meta.url), "utf8")),
  );
  return shards.join("");
}

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
  const lightCss = await readFile(new URL("../skins/builtin/light/skin.css", import.meta.url), "utf8");
  const scoped = scopeBuiltinThemeForCustomSkin(lightCss, "light", "community.example");
  assert.match(scoped, /:where\(\.ws-skin-root\[data-ws-skin="community\.example"\]\) \{\s*color-scheme: light;/);
  assert.match(scoped, /:where\(\.ws-skin-root\[data-ws-skin="community\.example"\]\) \.settings-content/);
});

async function componentSources(directory: string): Promise<string> {
  const componentRoot = new URL(directory, import.meta.url);
  const componentFiles = (await readdir(componentRoot, { recursive: true })).filter(path => path.endsWith(".vue"));
  return (await Promise.all(componentFiles.map(path => readFile(new URL(path.replaceAll("\\", "/"), componentRoot), "utf8")))).join("\n");
}

test("all public skin parts are documented and the admin console is outside skin scope", async () => {
  const [components, adminComponents] = await Promise.all([
    componentSources("../components/web-client/"), componentSources("../components/admin/"),
  ]);
  const [webClient, skinSwitcher, languageSwitcher, admin, documentation] = await Promise.all([
    readFile(new URL("../views/WebClient.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/SkinSwitcher.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/LanguageSwitcher.vue", import.meta.url), "utf8"),
    readFile(new URL("../views/AdminView.vue", import.meta.url), "utf8"),
    readFile(new URL("../../../docs/SKIN_DEVELOPMENT.md", import.meta.url), "utf8"),
  ]);
  const publicParts = new Set([...`${webClient}\n${components}\n${skinSwitcher}\n${languageSwitcher}`.matchAll(/data-ws-part="([^"]+)"/g)].map((match) => match[1]));
  for (const part of publicParts) assert.ok(documentation.includes(`\`${part}\``), `Undocumented skin part: ${part}`);
  assert.match(skinSwitcher, /data-ws-skin-id/);
  assert.match(skinSwitcher, /data-ws-state/);
  assert.match(languageSwitcher, /data-ws-language/);
  assert.doesNotMatch(`${admin}\n${adminComponents}`, /ws-skin-root|data-ws-page=/);
});

test("public skin and language selectors follow the page theme via tokens", async () => {
  const [skinSwitcher, languageSwitcher, darkSkin] = await Promise.all([
    readFile(new URL("../components/SkinSwitcher.vue", import.meta.url), "utf8"),
    readFile(new URL("../components/LanguageSwitcher.vue", import.meta.url), "utf8"),
    readFile(new URL("../skins/builtin/dark/skin.css", import.meta.url), "utf8"),
  ]);

  // 2026-10-14: the old "keep light surfaces in dark mode" contract was
  // retired after the night-mode dropdown report — both switchers now run on
  // --wsd-* tokens (day fallbacks keep admin's light look; its [data-theme]
  // block owns the dark state there).
  assert.match(skinSwitcher, /\.skin-trigger\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--wsd-accent/);
  assert.match(skinSwitcher, /\.skin-dropdown\s*\{[^}]*background:\s*var\(--wsd-panel/);
  assert.match(skinSwitcher, /\.skin-option\s*\{[^}]*color:\s*var\(--wsd-text/);
  assert.match(languageSwitcher, /\.language-dropdown\s*\{[^}]*background:\s*var\(--wsd-panel/);
  assert.doesNotMatch(darkSkin, /\.language-switcher\s+\.language-(?:trigger|dropdown|option)/);
});

test("skin content supports localized interface message overrides and includes the preview as an asset", async () => {
  const content = { defaultLocale: "en", locales: { en: { home: { title: "Welcome" }, messages: { speakingNow: "Live now" } } } };
  const skin = await importSkinPack(makeSkin('[data-ws-part="voice.member.avatar"] { background: url(assets/preview.png); }', content));
  assert.equal(skin.contentData?.locales.en?.messages?.speakingNow, "Live now");
  assert.equal(skin.previewBlob?.type, "image/png");
  assert.ok(skin.assets["assets/preview.png"]);
});


test("the activity artwork layer floats above room content without intercepting controls", async () => {
  const css = await readWebClientCss();
  assert.match(css, /\.app-shell \.workspace-content\s*\{\s*position: relative;\s*isolation: isolate;/);
  assert.match(css, /\.voice-activity-artwork\s*\{\s*position: absolute;\s*z-index: 2;\s*inset: -26px 0 -48px;[^}]*pointer-events: none;/);
  assert.match(css, /\.voice-activity-artwork\s*\{[^}]*transform: perspective\(1100px\) rotateY\(-2\.5deg\) translateZ\(22px\)/);
  assert.match(css, /:deep\(\.app-shell \.member-panel::before\)\s*\{\s*content: "";\s*position: absolute;\s*z-index: 1;\s*left: -28px;\s*bottom: 18px;\s*width: min\(430px, calc\(100vw - 24px\)\);\s*aspect-ratio: 3 \/ 2;[^}]*perspective\(1100px\) rotateY\(-8deg\)/);
  assert.match(css, /:deep\(\.app-shell \.chat-empty\[data-ws-state="messages-empty"\]\)\s*\{[^}]*min-height: 210px;\s*padding: 126px 12px 10px;/);
  assert.match(css, /:deep\(\.app-shell \.chat-panel \.section-heading\),[\s\S]*?:deep\(\.app-shell \.chat-panel \.message-composer\)\s*\{\s*position: relative;\s*z-index: 3;/);
  assert.match(css, /\.screen-share-player\)?\s*\{[^}]*background: var\(--surface-1\)/);
  assert.match(css, /\.screen-share-player-exit\)?\s*\{[^}]*z-index: 3;/);
  assert.match(css, /\.screen-share-player-stage\)?\s*\{[^}]*var\(--accent\)[^}]*var\(--surface-2\)/);
  assert.match(css, /\.screen-share-player-video\)?\s*\{[^}]*background: var\(--surface-2\)/);
  assert.match(css, /@media \(min-width: 741px\)\s*\{\s*\/\* The header is one rung on the --ws-z-\* ladder[\s\S]*?\.app-shell \.workspace-header\s*\{\s*position: relative;\s*z-index: var\(--ws-z-header\);/);
  // Modal masks must sit on a higher ladder rung than the header — the header
  // once hard-coded z-index: 40 and floated above every dialog backdrop.
  assert.match(css, /:deep\(\.modal-backdrop\)\s*\{\s*position: fixed;\s*z-index: var\(--ws-z-modal-mask\);/);
  assert.match(css, /\.web-client\s*\{[^}]*--ws-z-header: 100;[^}]*--ws-z-modal-mask: 400;/);
});

test("channel empty state removes its bubble ornament and keeps the text-channel label", async () => {
  const [view, chat] = await Promise.all([
    readFile(new URL("../components/web-client/ChatPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../composables/useWebClientChat.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(view, /data-ws-state="messages-empty"><div class="chat-empty-icon"/);
  assert.match(view, /class="section-kicker">\{\{ chatTabLabel \}\}/);
  assert.match(chat, /tab\.value === "channel" \? t\("textChannel"\)/);
});

test("homepage motion and room content spacing keep the baseline layout", async () => {
  const css = await readWebClientCss();
  // One reduced-motion kill switch covers the whole client (join page, voice
  // room and dialogs alike) — no per-section carve-outs anymore.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.web-client \*,\s*\.web-client \*::before,\s*\.web-client \*::after\s*\{\s*animation: none !important;\s*transition-duration: \.01ms !important;/);
  assert.ok(css.includes("animation: none !important"));
  assert.doesNotMatch(css, /\.join-page \*, \.join-page \*::before, \.join-page \*::after\s*\{\s*animation: none !important/);
  assert.ok(css.includes("padding: 0 clamp(12px, 1.4vw, 22px);"), "homepage header contents keep an inset from their container edge");
  assert.match(css, /\.chat-panel\s*\{\s*margin-top: 34px;\s*padding: 0 clamp\(14px, 1\.8vw, 24px\) 20px;/, "chat children keep horizontal and bottom breathing room");
  assert.match(css, /\.app-shell \.voice-section \{\s*position: relative;\s*padding: clamp\(14px, 1\.8vw, 24px\);/);
  assert.match(css, /@media \(max-width: 740px\) \{\s*\.app-shell \.voice-section \{\s*padding: 14px 10px 16px;/);
  assert.match(css, /\.join-card-waveform i \{[^}]*animation: screen-share-wave 1\.1s ease-in-out infinite alternate;/);
  assert.match(css, /@keyframes join-card-sonar-ring[\s\S]*?transform: scale\(\.6\);\s*opacity: \.62;[\s\S]*?transform: scale\(1\);\s*opacity: 0;/);
});

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
