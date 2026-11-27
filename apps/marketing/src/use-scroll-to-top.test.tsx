import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import type { MockInstance } from "vitest";
import { useScrollToTop } from "./use-scroll-to-top.js";

/** Renders at every location so pathname and hash changes re-run the hook. */
function Harness() {
  useScrollToTop();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div>
      <div data-testid="here">{`${location.pathname}${location.hash}`}</div>
      <button data-testid="push" onClick={() => navigate("/metrics")}>
        push
      </button>
      <button data-testid="replace" onClick={() => navigate("/status", { replace: true })}>
        replace
      </button>
      <button data-testid="anchor" onClick={() => navigate("/acmm#maturity")}>
        anchor
      </button>
      <button data-testid="skip" onClick={() => navigate({ hash: "#main-content" })}>
        skip
      </button>
      <button data-testid="back" onClick={() => navigate(-1)}>
        back
      </button>
      <button data-testid="forward" onClick={() => navigate(1)}>
        forward
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={["/shipped"]}>
      <Harness />
    </MemoryRouter>
  );
}

const INSTANT_TOP = { top: 0, left: 0, behavior: "instant" } as const;

describe("useScrollToTop", () => {
  let windowScrollTo: MockInstance;

  beforeEach(() => {
    windowScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    windowScrollTo.mockRestore();
  });

  it("does not scroll on the initial load, so a reload can restore its own offset", () => {
    renderHarness();
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("jumps the window to the top on push navigation", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("push"));
    expect(windowScrollTo).toHaveBeenCalledWith(INSTANT_TOP);
  });

  it("jumps the window to the top on replace navigation", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("replace"));
    expect(windowScrollTo).toHaveBeenCalledWith(INSTANT_TOP);
  });

  it("stays an instant jump when the visitor prefers reduced motion", () => {
    // `behavior: "auto"` would follow `html { scroll-behavior: smooth }` and
    // animate even under prefers-reduced-motion. Route changes never glide.
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;

    try {
      renderHarness();
      fireEvent.click(screen.getByTestId("push"));
      expect(windowScrollTo).toHaveBeenCalledWith(INSTANT_TOP);
    } finally {
      window.matchMedia = original;
    }
  });

  it("skips POP navigations so Back and Forward keep their scroll positions", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("push"));
    windowScrollTo.mockClear();

    fireEvent.click(screen.getByTestId("back"));
    expect(screen.getByTestId("here")).toHaveTextContent("/shipped");
    expect(windowScrollTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("forward"));
    expect(screen.getByTestId("here")).toHaveTextContent("/metrics");
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("skips a navigation that targets an in-page anchor", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("anchor"));
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("skips a same-page hash change such as the skip link", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("skip"));
    expect(screen.getByTestId("here")).toHaveTextContent("/shipped#main-content");
    expect(windowScrollTo).not.toHaveBeenCalled();
  });
});
