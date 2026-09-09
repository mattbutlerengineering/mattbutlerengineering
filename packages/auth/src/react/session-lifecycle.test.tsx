// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";

const mockUseAuth = vi.fn();

vi.mock("react-oidc-context", () => ({
  useAuth: () => mockUseAuth(),
}));

import { SessionLifecycleProvider } from "./session-lifecycle.js";
import { useSessionLifecycle } from "./session-lifecycle-context.js";

type Listener = () => void;

/** Minimal stand-in for oidc-client-ts's UserManagerEvents. */
function makeEvents() {
  const listeners: Record<string, Set<Listener>> = {
    expired: new Set(),
    loaded: new Set(),
  };
  return {
    addAccessTokenExpired: vi.fn((cb: Listener) => listeners.expired!.add(cb)),
    removeAccessTokenExpired: vi.fn((cb: Listener) => listeners.expired!.delete(cb)),
    addUserLoaded: vi.fn((cb: Listener) => listeners.loaded!.add(cb)),
    removeUserLoaded: vi.fn((cb: Listener) => listeners.loaded!.delete(cb)),
    fireExpired: () => listeners.expired!.forEach((cb) => cb()),
    fireLoaded: () => listeners.loaded!.forEach((cb) => cb()),
    listenerCount: () => listeners.expired!.size + listeners.loaded!.size,
  };
}

function Probe() {
  const { expired } = useSessionLifecycle();
  return <span data-testid="expired">{String(expired)}</span>;
}

describe("SessionLifecycleProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports expired=false by default and without a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("expired")).toHaveTextContent("false");
  });

  it("flips expired to true when the access token expires", () => {
    const events = makeEvents();
    mockUseAuth.mockReturnValue({ events });

    render(
      <SessionLifecycleProvider>
        <Probe />
      </SessionLifecycleProvider>
    );

    expect(screen.getByTestId("expired")).toHaveTextContent("false");
    act(() => events.fireExpired());
    expect(screen.getByTestId("expired")).toHaveTextContent("true");
  });

  it("clears expired when a new user session is loaded", () => {
    const events = makeEvents();
    mockUseAuth.mockReturnValue({ events });

    render(
      <SessionLifecycleProvider>
        <Probe />
      </SessionLifecycleProvider>
    );

    act(() => events.fireExpired());
    expect(screen.getByTestId("expired")).toHaveTextContent("true");
    act(() => events.fireLoaded());
    expect(screen.getByTestId("expired")).toHaveTextContent("false");
  });

  it("unsubscribes every listener on unmount", () => {
    const events = makeEvents();
    mockUseAuth.mockReturnValue({ events });

    const { unmount } = render(
      <SessionLifecycleProvider>
        <Probe />
      </SessionLifecycleProvider>
    );
    expect(events.listenerCount()).toBe(2);
    unmount();
    expect(events.listenerCount()).toBe(0);
    expect(events.removeAccessTokenExpired).toHaveBeenCalledOnce();
    expect(events.removeUserLoaded).toHaveBeenCalledOnce();
  });

  it("renders children and stays inert when the context exposes no events (SSR shape)", () => {
    mockUseAuth.mockReturnValue({ events: undefined });

    render(
      <SessionLifecycleProvider>
        <Probe />
      </SessionLifecycleProvider>
    );

    expect(screen.getByTestId("expired")).toHaveTextContent("false");
  });
});
