import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowMobileGate } from "./mobile-gate.js";

const phone = {
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
  maxTouchPoints: 5,
  coarsePointer: true,
  viewportWidth: 390,
  storedChoice: null,
};

test("phone-class touch devices on a narrow viewport are gated", () => {
  assert.equal(shouldShowMobileGate(phone), true);
  assert.equal(shouldShowMobileGate({ ...phone, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" }), true);
});

test("a stored continue choice always wins", () => {
  assert.equal(shouldShowMobileGate({ ...phone, storedChoice: "continue" }), false);
});

test("tablets and desktops keep the full site", () => {
  const ipad = { ...phone, userAgent: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" };
  const ipadOsDesktopUa = { ...phone, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/604.1", maxTouchPoints: 5 };
  const androidTablet = { ...phone, userAgent: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/126 Safari/537.36" };
  const desktop = { ...phone, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36", maxTouchPoints: 0, coarsePointer: false, viewportWidth: 1440 };
  const desktopTouch = { ...desktop, maxTouchPoints: 5, coarsePointer: true };
  assert.equal(shouldShowMobileGate(ipad), false);
  assert.equal(shouldShowMobileGate(ipadOsDesktopUa), false);
  assert.equal(shouldShowMobileGate(androidTablet), false);
  assert.equal(shouldShowMobileGate(desktop), false);
  assert.equal(shouldShowMobileGate(desktopTouch), false);
});

test("phone-sized desktop windows and landscape phones are not gated", () => {
  // Dev-tools narrow window on a desktop UA.
  assert.equal(shouldShowMobileGate({ ...phone, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/126 Safari/537.36", coarsePointer: false }), false);
  // Landscape phone: wide enough to use the site.
  assert.equal(shouldShowMobileGate({ ...phone, viewportWidth: 844 }), false);
});
