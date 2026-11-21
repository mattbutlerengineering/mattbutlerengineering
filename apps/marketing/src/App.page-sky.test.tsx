import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RialtoProvider, ToastProvider } from "@mattbutlerengineering/rialto";
import { App } from "./App.js";

// The shell half of the page sky (utils/page-sky): App.test.tsx mocks Rialto
// and cannot render /venues, so this file renders the real page in the real
// shell and checks the nav wrapper takes the page's light.

describe("App nav under a page sky", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives the nav the /venues sky: day at the top, night once doors is on screen", async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    class CapturingObserver {
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    vi.stubGlobal("IntersectionObserver", CapturingObserver);

    const { container } = render(
      <RialtoProvider vibe="presenting">
        <ToastProvider>
          <MemoryRouter initialEntries={["/venues"]}>
            <App theme="light" onThemeToggle={vi.fn()} />
          </MemoryRouter>
        </ToastProvider>
      </RialtoProvider>
    );

    // The route chunk loads lazily and is slow when the whole suite runs at once.
    await screen.findByRole(
      "heading",
      { level: 1, name: "Tonight, handled." },
      { timeout: 10_000 }
    );
    const navSky = container.querySelector("[data-nav-sky]");
    // The page reports its sky from an effect, one commit after the lazy route mounts.
    await waitFor(() => expect(navSky).toHaveAttribute("data-theme", "light"));

    // Every observer on the page gets the entry; only the scene observer reads `data-scene`.
    const doors = container.querySelector('[data-scene="doors"]');
    expect(doors).not.toBeNull();
    act(() =>
      callbacks.forEach((callback) =>
        callback(
          [{ isIntersecting: true, target: doors } as IntersectionObserverEntry],
          {} as IntersectionObserver
        )
      )
    );
    expect(navSky).toHaveAttribute("data-theme", "dark");
  }, 15_000);
});
