// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { useLanguageState } from "./use-i18n";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("setLanguage keeps its identity across a language change", () => {
  // The page's mount effect lists setLanguage in its dependency array. A new
  // identity per switch re-runs that effect's cleanup — which disconnects and
  // disposes the live voice session — so switching the UI language would drop
  // the user out of the room.
  const { result } = renderHook(() => useLanguageState());
  const before = result.current.setLanguage;
  act(() => before("en"));
  expect(result.current.language).toBe("en");
  expect(result.current.setLanguage).toBe(before);
  expect(localStorage.getItem("webspeak:language")).toBe("en");
  act(() => result.current.setLanguage("zh"));
  expect(result.current.language).toBe("zh");
  expect(result.current.setLanguage).toBe(before);
});
