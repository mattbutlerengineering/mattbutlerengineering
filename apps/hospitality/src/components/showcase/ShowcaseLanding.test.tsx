import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useAuth } from "@mbe/auth/react";
import { ShowcaseLanding } from "./ShowcaseLanding.js";
import { ROADMAP, SCENES } from "./service-night.js";
import enUS from "../../i18n/catalogs/en-US.json";

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));

const copy = enUS.showcase;
const signIn = vi.fn();

type Callback = IntersectionObserverCallback;

/**
 * jsdom has no IntersectionObserver. This one records every callback, so a
 * test can say which scene sits on the viewport's centre line.
 */
function stubObservers() {
  const callbacks: Callback[] = [];
  const disconnect = vi.fn();
  class CapturingObserver {
    constructor(callback: Callback) {
      callbacks.push(callback);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect = disconnect;
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", CapturingObserver);
  return { callbacks, disconnect };
}

function centre(container: HTMLElement, callbacks: Callback[], sceneId: string) {
  const target = container.querySelector(`[data-scene="${sceneId}"]`);
  expect(target, sceneId).not.toBeNull();
  act(() =>
    callbacks.forEach((callback) =>
      callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    )
  );
}

describe("ShowcaseLanding", () => {
  let observers: ReturnType<typeof stubObservers>;
  let noCanvas: { mockRestore: () => void };

  beforeEach(() => {
    signIn.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      signIn,
      activeNavigator: undefined,
    } as unknown as ReturnType<typeof useAuth>);
    observers = stubObservers();
    // src/test/setup.ts stubs a text-measuring 2D context for axe. The hero's
    // SilkFlow would try to paint on it, so it gets what real jsdom gives: none.
    noCanvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    noCanvas.mockRestore();
  });

  it("has one h1 and an h2 for every later scene, in clock order", () => {
    render(<ShowcaseLanding />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      copy.scenes.hero.heading,
    ]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
      SCENES.slice(1).map((scene) => copy.scenes[scene.id].heading)
    );
  });

  it("stamps each scene with its clock time", () => {
    const { container } = render(<ShowcaseLanding />);
    for (const scene of SCENES.slice(1)) {
      const section = container.querySelector(`[data-scene="${scene.id}"]`);
      expect(section?.querySelector("time")?.textContent, scene.id).toBe(scene.time);
    }
  });

  it("marks every concept as a concept and every shipped claim as live", () => {
    render(<ShowcaseLanding />);
    for (const claim of [...SCENES.flatMap((scene) => scene.claims), ...ROADMAP]) {
      const item = screen.getByTestId(`claim-${claim.id}`);
      const expected = claim.status === "concept" ? copy.status.concept : copy.status.shipped;
      const unexpected = claim.status === "concept" ? copy.status.shipped : copy.status.concept;
      expect(within(item).getByText(expected), claim.id).toBeInTheDocument();
      expect(within(item).queryByText(unexpected), claim.id).toBeNull();
    }
  });

  it("keeps the sign-in contract: the login prompt, and exactly one button named Sign In", () => {
    render(<ShowcaseLanding />);
    expect(screen.getByTestId("login-prompt")).toBeInTheDocument();
    // Playwright's getByRole name match is a case-insensitive substring, so
    // match the same way: a second "sign in…" button would break auth.spec.ts.
    const signInButtons = screen.getAllByRole("button", { name: /sign in/i });
    expect(signInButtons).toHaveLength(1);

    fireEvent.click(signInButtons[0]!);
    expect(signIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: copy.morning.open }));
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("titles the document as the sign-in gate does, and hands the title back on leaving", () => {
    document.title = "Dashboard - Matt Butler Engineering";
    const { unmount } = render(<ShowcaseLanding />);
    expect(document.title).toBe("Hospitality - Matt Butler Engineering");
    unmount();
    expect(document.title).toBe("Dashboard - Matt Butler Engineering");
  });

  it("lets the visitor confirm the terrace block, then undo it", () => {
    render(<ShowcaseLanding />);
    const chat = screen.getByRole("region", { name: copy.assistant.label });

    fireEvent.click(within(chat).getByRole("button", { name: copy.assistant.confirm }));
    expect(within(chat).getByText(copy.assistant.done)).toBeInTheDocument();
    expect(within(chat).queryByRole("button", { name: copy.assistant.confirm })).toBeNull();

    fireEvent.click(within(chat).getByRole("button", { name: copy.assistant.undo }));
    expect(within(chat).getByText(copy.assistant.proposal)).toBeInTheDocument();
  });

  it("tells the host stand when the guest is running late, then when they arrive", () => {
    render(<ShowcaseLanding />);
    const hostStand = screen.getByRole("status", { name: copy.guest.hostStand });
    expect(hostStand).toHaveTextContent(copy.guest.waiting);

    fireEvent.click(screen.getByRole("button", { name: copy.guest.late }));
    expect(hostStand).toHaveTextContent(copy.guest.runningLate);

    fireEvent.click(screen.getByRole("button", { name: copy.guest.here }));
    expect(hostStand).toHaveTextContent(copy.guest.arrived);
  });

  it("lists the rush as tables with their bookings, not only as a picture", () => {
    render(<ShowcaseLanding />);
    const chart = screen.getByRole("list", { name: copy.rush.chartLabel });
    expect(within(chart).getByText("Table 7")).toBeInTheDocument();
    expect(within(chart).getByText("Haddad, party of 6, 19:30, running late")).toBeInTheDocument();
    expect(within(chart).getByText("Walk-in, party of 3, 18:15, finished")).toBeInTheDocument();
  });

  it("turns the lights down and the sign on at doors, and reports each sky to the shell", () => {
    const onSkyChange = vi.fn();
    const { container, unmount } = render(<ShowcaseLanding onSkyChange={onSkyChange} />);
    const sky = container.querySelector("[data-sky]");
    expect(sky).toHaveAttribute("data-theme", "light");
    expect(onSkyChange).toHaveBeenLastCalledWith("light");
    expect(screen.getByRole("img", { name: copy.doors.closed })).toBeInTheDocument();

    centre(container, observers.callbacks, "doors");
    expect(sky).toHaveAttribute("data-theme", "dark");
    expect(onSkyChange).toHaveBeenLastCalledWith("dark");
    expect(screen.getByRole("img", { name: copy.doors.open })).toBeInTheDocument();

    centre(container, observers.callbacks, "morning");
    expect(sky).toHaveAttribute("data-theme", "light");

    unmount();
    expect(onSkyChange).toHaveBeenLastCalledWith(null);
    expect(observers.disconnect).toHaveBeenCalled();
  });

  it("keeps the whole page dark when the visitor has chosen dark mode", () => {
    const onSkyChange = vi.fn();
    const { container } = render(
      <ShowcaseLanding preferredTheme="dark" onSkyChange={onSkyChange} />
    );
    const sky = container.querySelector("[data-sky]");
    expect(sky).toHaveAttribute("data-theme", "dark");
    expect(onSkyChange).toHaveBeenLastCalledWith("dark");

    // The doors still follow the scene, not the theme.
    expect(screen.getByRole("img", { name: copy.doors.closed })).toBeInTheDocument();

    centre(container, observers.callbacks, "morning");
    expect(sky).toHaveAttribute("data-theme", "dark");
  });
});
