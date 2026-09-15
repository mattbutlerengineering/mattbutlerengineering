import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { NOW_LINE_VIEWPORT_FRACTION, useScrollToNow } from "./useScrollToNow.js";

/* ── Motion preset — the only rialto input the hook reads ── */

const { motion } = vi.hoisted(() => ({
  motion: { precision: { duration: 0.2 } as { duration: number } },
}));

vi.mock("@mattbutlerengineering/rialto/providers", () => ({
  useMotionPreset: () => motion,
}));

/* ── A scroll container the way jsdom (no Element.scrollTo) and a browser expose one ── */

function makeScroller({ clientWidth = 800, withScrollTo = true } = {}) {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientWidth", { value: clientWidth, configurable: true });
  const scrollTo = vi.fn();
  if (withScrollTo)
    Object.defineProperty(element, "scrollTo", { value: scrollTo, configurable: true });
  const ref: RefObject<HTMLElement | null> = { current: element };
  return { element, scrollTo, ref };
}

interface Props {
  offset: number | null;
  column: number;
}

function renderScrollToNow(ref: RefObject<HTMLElement | null>, initialProps: Props) {
  return renderHook(({ offset, column }: Props) => useScrollToNow(ref, offset, column), {
    initialProps,
  });
}

describe("useScrollToNow (A5.1 unit)", () => {
  beforeEach(() => {
    motion.precision = { duration: 0.2 };
  });

  it("puts the now-line a quarter of the way across the viewport, smoothly", () => {
    expect(NOW_LINE_VIEWPORT_FRACTION).toBe(0.25);
    const { ref, scrollTo } = makeScroller({ clientWidth: 800 });
    renderScrollToNow(ref, { offset: 540, column: 120 });
    // 120 + 540 − 800 / 4
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ left: 460, behavior: "smooth" });
  });

  it("uses the grid's own table-column width (80 px on the phone grid)", () => {
    const { ref, scrollTo } = makeScroller({ clientWidth: 800 });
    renderScrollToNow(ref, { offset: 540, column: 80 });
    expect(scrollTo).toHaveBeenCalledWith({ left: 420, behavior: "smooth" });
  });

  it("never scrolls below 0", () => {
    const { ref, scrollTo } = makeScroller({ clientWidth: 800 });
    renderScrollToNow(ref, { offset: 30, column: 120 });
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "smooth" });
  });

  it("is instant under reduced motion", () => {
    motion.precision = { duration: 0 };
    const { ref, scrollTo } = makeScroller({ clientWidth: 800 });
    renderScrollToNow(ref, { offset: 540, column: 120 });
    expect(scrollTo).toHaveBeenCalledWith({ left: 460, behavior: "instant" });
  });

  it("does nothing without a now-line", () => {
    const { ref, scrollTo, element } = makeScroller({ clientWidth: 800 });
    renderScrollToNow(ref, { offset: null, column: 120 });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(element.scrollLeft).toBe(0);
  });

  it("scrolls once when the now-line appears, and leaves the Host's scroll alone on every tick", () => {
    const { ref, scrollTo } = makeScroller({ clientWidth: 800 });
    const { rerender } = renderScrollToNow(ref, { offset: null, column: 120 });
    expect(scrollTo).not.toHaveBeenCalled();

    rerender({ offset: 300, column: 120 }); // Today selected — the line appears
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 220, behavior: "smooth" });

    rerender({ offset: 302, column: 120 }); // the minute tick
    rerender({ offset: 304, column: 120 });
    expect(scrollTo).toHaveBeenCalledTimes(1);

    rerender({ offset: null, column: 120 }); // another date
    rerender({ offset: 400, column: 120 }); // back to today
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 320, behavior: "smooth" });
  });

  it("assigns scrollLeft where the element has no scrollTo (jsdom)", () => {
    const { ref, element } = makeScroller({ clientWidth: 800, withScrollTo: false });
    expect(typeof element.scrollTo).toBe("undefined");
    renderScrollToNow(ref, { offset: 540, column: 120 });
    expect(element.scrollLeft).toBe(460);
  });
});
