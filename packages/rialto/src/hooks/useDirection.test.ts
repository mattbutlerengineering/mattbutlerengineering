import { renderHook, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDirection } from "./useDirection";

/**
 * The hook's effect is keyed on `[ref]`, so the object identity must be stable
 * across renders — a fresh literal each render would re-run the effect.
 */
function refTo(el: HTMLElement | null) {
  return { current: el };
}

function mount(html: string, selector: string) {
  document.body.innerHTML = html;
  const el = document.body.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`fixture selector "${selector}" matched nothing`);
  return el;
}

/**
 * Applies a `dir` mutation and lets the MutationObserver callback that reacts
 * to it run inside the same act() scope.
 *
 * The re-read is observer-driven, so the state update does not happen
 * synchronously with setAttribute. Mutating outside act() — or polling with
 * waitFor, whose first poll runs after the callback has already fired — leaves
 * that update unwrapped, which both logs a React act() warning and makes the
 * assertion depend on timing rather than on the hook working.
 */
async function mutateDir(el: HTMLElement, value: string) {
  await act(async () => {
    el.setAttribute("dir", value);
    // MutationObserver delivers its callback on the microtask queue, so
    // yielding once is enough — no timer needed.
    await Promise.resolve();
  });
}

describe("useDirection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // `dir` on <html> is global state that outlives a single test, and the
    // fallback cases below read it directly — a leak would silently flip an
    // unrelated assertion.
    document.documentElement.removeAttribute("dir");
  });

  afterEach(() => {
    // cleanup() first, deliberately. Testing Library's automatic cleanup runs
    // in its own afterEach, and stripping `dir` from <html> before the hook is
    // unmounted lets an observer still watching <html> fire outside act() —
    // which surfaces as a React act() warning attributed to whichever test
    // happened to observe the fallback target.
    cleanup();
    document.documentElement.removeAttribute("dir");
    vi.restoreAllMocks();
  });

  it("returns 'ltr' when no [dir] ancestor exists and <html> has no dir", () => {
    const el = mount(`<div><span id="target"></span></div>`, "#target");
    const { result } = renderHook(() => useDirection(refTo(el)));
    expect(result.current).toBe("ltr");
  });

  it("returns 'rtl' when the closest [dir] ancestor is dir='rtl'", () => {
    const el = mount(`<div dir="rtl"><span id="target"></span></div>`, "#target");
    const { result } = renderHook(() => useDirection(refTo(el)));
    expect(result.current).toBe("rtl");
  });

  it("prefers the nearest [dir] ancestor over a further one", () => {
    const el = mount(
      `<div dir="rtl"><div dir="ltr"><span id="target"></span></div></div>`,
      "#target"
    );
    const { result } = renderHook(() => useDirection(refTo(el)));
    expect(result.current).toBe("ltr");
  });

  it("falls back to <html>'s direction when there is no [dir] ancestor", () => {
    document.documentElement.setAttribute("dir", "rtl");
    const el = mount(`<div><span id="target"></span></div>`, "#target");
    const { result } = renderHook(() => useDirection(refTo(el)));
    expect(result.current).toBe("rtl");
  });

  it("updates when the observed ancestor's dir attribute changes after mount", async () => {
    const el = mount(`<div dir="ltr"><span id="target"></span></div>`, "#target");
    const ancestor = el.closest("[dir]") as HTMLElement;
    const { result } = renderHook(() => useDirection(refTo(el)));
    expect(result.current).toBe("ltr");

    await mutateDir(ancestor, "rtl");

    expect(result.current).toBe("rtl");
  });

  it("updates when <html>'s dir changes after mount (fallback target)", async () => {
    const el = mount(`<div><span id="target"></span></div>`, "#target");
    const { result } = renderHook(() => useDirection(refTo(el)));
    expect(result.current).toBe("ltr");

    await mutateDir(document.documentElement, "rtl");

    expect(result.current).toBe("rtl");
  });

  it("disconnects the MutationObserver on unmount", () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const el = mount(`<div dir="ltr"><span id="target"></span></div>`, "#target");
    const { unmount } = renderHook(() => useDirection(refTo(el)));

    expect(disconnect).not.toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("stops responding to dir changes once unmounted", async () => {
    const el = mount(`<div dir="ltr"><span id="target"></span></div>`, "#target");
    const ancestor = el.closest("[dir]") as HTMLElement;
    const { result, unmount } = renderHook(() => useDirection(refTo(el)));
    unmount();

    // Deliberately not act()-wrapped: the assertion is that nothing updates.
    // Flush past the tick a live observer would have used, then assert the
    // value is unchanged.
    ancestor.setAttribute("dir", "rtl");
    await Promise.resolve();

    expect(result.current).toBe("ltr");
  });

  it("returns 'ltr' without throwing when ref.current is null", () => {
    const { result } = renderHook(() => useDirection(refTo(null)));
    expect(result.current).toBe("ltr");
  });

  it("does not create an observer when ref.current is null", () => {
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    renderHook(() => useDirection(refTo(null)));
    expect(observe).not.toHaveBeenCalled();
  });
});
