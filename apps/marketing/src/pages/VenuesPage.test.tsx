import { describe, it, expect, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { RialtoProvider, ToastProvider } from "@mattbutlerengineering/rialto";
import { VenuesPage } from "./VenuesPage.js";
import { ROADMAP, SCENES } from "../data/service-night.js";

function renderVenuesPage() {
  return render(
    <RialtoProvider vibe="presenting">
      <ToastProvider>
        <MemoryRouter>
          <VenuesPage />
        </MemoryRouter>
      </ToastProvider>
    </RialtoProvider>
  );
}

describe("VenuesPage", () => {
  it("has one h1 and an h2 for every later scene, in clock order", () => {
    renderVenuesPage();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Tonight, handled.",
    ]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      SCENES.slice(1).map((scene) => scene.heading)
    );
  });

  it("stamps each scene with its clock time", () => {
    const { container } = renderVenuesPage();
    for (const scene of SCENES.slice(1)) {
      const section = container.querySelector(`[data-scene="${scene.id}"]`);
      expect(section, scene.id).not.toBeNull();
      expect(section?.querySelector("time")?.textContent).toBe(scene.time);
    }
  });

  it("marks every concept as a concept and every shipped claim as live", () => {
    renderVenuesPage();
    const claims = [...SCENES.flatMap((scene) => scene.claims), ...ROADMAP];
    for (const claim of claims) {
      const item = screen.getByTestId(`claim-${claim.id}`);
      const expected = claim.status === "concept" ? "Concept" : "Live today";
      const unexpected = claim.status === "concept" ? "Live today" : "Concept";
      expect(within(item).getByText(expected), claim.id).toBeInTheDocument();
      expect(within(item).queryByText(unexpected), claim.id).toBeNull();
    }
  });

  it("starts the night with the lights up and the sign dark", () => {
    const { container } = renderVenuesPage();
    expect(container.querySelector("[data-sky]")).toHaveAttribute("data-theme", "light");
    expect(screen.getByRole("img", { name: /closed/i })).toBeInTheDocument();
  });

  it("lets the visitor confirm the terrace block, then undo it", () => {
    renderVenuesPage();
    const chat = screen.getByRole("region", { name: "Assistant conversation" });

    expect(within(chat).getByText(/block the terrace/i)).toBeInTheDocument();
    fireEvent.click(within(chat).getByRole("button", { name: "Confirm" }));
    expect(within(chat).getByText(/terrace is blocked/i)).toBeInTheDocument();
    expect(within(chat).queryByRole("button", { name: "Confirm" })).toBeNull();

    fireEvent.click(within(chat).getByRole("button", { name: "Undo" }));
    expect(within(chat).getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(within(chat).queryByText(/terrace is blocked/i)).toBeNull();
  });

  it("tells the host stand when the guest is running late, then when they arrive", () => {
    renderVenuesPage();
    const hostStand = screen.getByRole("status", { name: "Host stand" });
    expect(hostStand).toHaveTextContent("Waiting for the Ito party");

    fireEvent.click(screen.getByRole("button", { name: "Running 15 min late" }));
    expect(hostStand).toHaveTextContent("The Ito party is running 15 minutes late");

    fireEvent.click(screen.getByRole("button", { name: "We're here" }));
    expect(hostStand).toHaveTextContent("The Ito party is here");
  });

  it("lists the rush as tables with their bookings, not only as a picture", () => {
    renderVenuesPage();
    const chart = screen.getByRole("list", { name: "Tables from 18:00 to 22:00" });
    expect(within(chart).getByText("Table 7")).toBeInTheDocument();
    expect(within(chart).getByText(/Haddad, 6 covers, 19:30, running late/)).toBeInTheDocument();
  });

  it("ends on a way to reach Matt and a way into the live demo", () => {
    renderVenuesPage();
    const morning = screen
      .getByRole("heading", { name: "Tomorrow is already set." })
      .closest("section");
    expect(morning).not.toBeNull();
    const links = within(morning as HTMLElement).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      expect.stringMatching(/^mailto:/),
      "/hospitality/?ref=marketing",
    ]);
  });

  describe("day and night", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** Stands in for the browser observer and lets the test say which scene is centred. */
    function stubSceneObserver() {
      const state = {
        callback: undefined as IntersectionObserverCallback | undefined,
        disconnect: vi.fn(),
      };
      class CapturingObserver {
        constructor(callback: IntersectionObserverCallback) {
          state.callback = callback;
        }
        observe(): void {}
        unobserve(): void {}
        disconnect = state.disconnect;
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
      }
      vi.stubGlobal("IntersectionObserver", CapturingObserver);
      return state;
    }

    it("turns the lights down and the sign on at doors, then up again at morning", () => {
      const observer = stubSceneObserver();
      const { container, unmount } = renderVenuesPage();
      const sky = container.querySelector("[data-sky]");
      const centre = (sceneId: string) => {
        const target = container.querySelector(`[data-scene="${sceneId}"]`);
        expect(target, sceneId).not.toBeNull();
        act(() =>
          observer.callback?.(
            [{ isIntersecting: true, target } as IntersectionObserverEntry],
            {} as IntersectionObserver
          )
        );
      };

      centre("doors");
      expect(sky).toHaveAttribute("data-theme", "dark");
      expect(screen.getByRole("img", { name: /open until/i })).toBeInTheDocument();

      centre("morning");
      expect(sky).toHaveAttribute("data-theme", "light");
      expect(screen.getByRole("img", { name: /closed/i })).toBeInTheDocument();

      unmount();
      expect(observer.disconnect).toHaveBeenCalled();
    });
  });
});
