import { describe, it, expect, vi, beforeEach } from "vitest";
import { installPreloadErrorReload } from "./preload-reload";

describe("installPreloadErrorReload", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("reloads once on vite:preloadError and prevents the default throw", () => {
    const reload = vi.fn();
    const target = new EventTarget();
    installPreloadErrorReload(target, reload);
    const ev = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(ev);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("does not reload again in a loop when the reload already happened", () => {
    const reload = vi.fn();
    const target = new EventTarget();
    installPreloadErrorReload(target, reload);
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again for a later deploy once the loop window has passed (#9868)", () => {
    const reload = vi.fn();
    const target = new EventTarget();
    let now = 1_000_000;
    installPreloadErrorReload(target, reload, () => now);
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    now += 5 * 60_000;
    const later = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(later);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(later.defaultPrevented).toBe(true);
  });

  it("still stops a loop: a second error inside the window does not reload", () => {
    const reload = vi.fn();
    const target = new EventTarget();
    let now = 1_000_000;
    installPreloadErrorReload(target, reload, () => now);
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    now += 5_000;
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
