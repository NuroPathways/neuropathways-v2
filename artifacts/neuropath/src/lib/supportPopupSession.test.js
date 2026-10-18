import { afterEach, describe, expect, it } from "vitest";
import { clearSupportPopupSession, hasSupportPopupBeenShown, markSupportPopupShown } from "./supportPopupSession";

afterEach(() => {
  clearSupportPopupSession("parent-a");
  clearSupportPopupSession("parent-b");
  try { window.sessionStorage.clear(); } catch { /* Storage may be unavailable. */ }
});

describe("parent support popup session state", () => {
  it("is scoped to the authenticated parent and can be reset at logout", () => {
    expect(hasSupportPopupBeenShown("parent-a")).toBe(false);
    markSupportPopupShown("parent-a");
    expect(hasSupportPopupBeenShown("parent-a")).toBe(true);
    expect(hasSupportPopupBeenShown("parent-b")).toBe(false);
    clearSupportPopupSession("parent-a");
    expect(hasSupportPopupBeenShown("parent-a")).toBe(false);
  });
});
