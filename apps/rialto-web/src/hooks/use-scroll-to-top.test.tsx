import { useRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import type { MockInstance } from "vitest";
import { useScrollToTop } from "./use-scroll-to-top.js";

interface HarnessProps {
  useContainer?: boolean;
}

/** Renders at every location so pathname changes re-run the hook. */
function Harness({ useContainer = false }: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollToTop(useContainer ? containerRef : undefined);
  const navigate = useNavigate();

  return (
    <div ref={containerRef} data-testid="scroll-container">
      <button data-testid="push" onClick={() => navigate("/next")}>
        push
      </button>
      <button data-testid="anchor" onClick={() => navigate("/docs#usage")}>
        anchor
      </button>
      <button data-testid="back" onClick={() => navigate(-1)}>
        back
      </button>
    </div>
  );
}

function renderHarness(useContainer = false) {
  return render(
    <MemoryRouter initialEntries={["/start"]}>
      <Harness useContainer={useContainer} />
    </MemoryRouter>
  );
}

describe("useScrollToTop", () => {
  let windowScrollTo: MockInstance;

  beforeEach(() => {
    windowScrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    windowScrollTo.mockRestore();
  });

  it("does not scroll on initial render", () => {
    renderHarness();
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("scrolls the window to the top on push navigation", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("push"));
    expect(windowScrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("skips POP navigations so back/forward scroll restoration wins", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("push"));
    windowScrollTo.mockClear();

    fireEvent.click(screen.getByTestId("back"));
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("skips navigations targeting an in-page anchor", () => {
    renderHarness();
    fireEvent.click(screen.getByTestId("anchor"));
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it("scrolls the container instead of the window when a ref is provided", () => {
    renderHarness(true);
    const container = screen.getByTestId("scroll-container");
    const containerScrollTo = vi.fn();
    container.scrollTo = containerScrollTo;

    fireEvent.click(screen.getByTestId("push"));

    expect(containerScrollTo).toHaveBeenCalledWith(0, 0);
    expect(windowScrollTo).not.toHaveBeenCalled();
  });
});
