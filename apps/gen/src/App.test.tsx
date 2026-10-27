import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import type { ElementType, ReactNode } from "react";
import type { AuthGate } from "@mbe/auth/react";
import { App, CallbackRedirect } from "./App.js";

// Gate ORDER (which phase for which auth facts + URL) is owned and table-tested
// by @mbe/auth's resolveAuthGate; here we only assert phase → screen.
vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
  useAuthGate: vi.fn(),
  signinReturnTo: vi.fn(),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: ReactNode }) => <div data-testid="stack">{children}</div>,
  Text: ({ children, as: As = "span" }: { children: ReactNode; as?: ElementType }) => (
    <As>{children}</As>
  ),
  GlobalNav: () => (
    <nav aria-label="Global">
      <a href="/">MBE</a>
    </nav>
  ),
  Footer: ({ children }: { children?: ReactNode }) => <footer>{children}</footer>,
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// The logged-out landing is covered in depth by LoginLanding.test.tsx; here we
// only assert that App routes to it when unauthenticated.
vi.mock("./components/LoginLanding.js", () => ({
  LoginLanding: () => <div data-testid="login-landing" />,
}));

import { useAuth, useAuthGate, signinReturnTo } from "@mbe/auth/react";

const mockUseAuth = useAuth as unknown as Mock;
const mockUseAuthGate = useAuthGate as unknown as Mock;
const mockSigninReturnTo = signinReturnTo as unknown as Mock;
const signIn = vi.fn();

const renderAt = (gate: AuthGate, path = "/") => {
  mockUseAuthGate.mockReturnValue(gate);
  window.history.replaceState({}, "", path);
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="*" element={<div data-testid="outlet" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
};

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ signIn });
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it.each(["loading", "callback", "signing-out"] as const)("shows Loading... for %s", (phase) => {
    renderAt({ phase });
    expect(screen.getByText("Loading...")).toBeDefined();
    expect(screen.queryByTestId("outlet")).toBeNull();
  });

  it("surfaces the error message for the error phase", () => {
    renderAt({ phase: "error", error: new Error("Auth failed"), onCallback: true });
    expect(screen.getByText("Authentication Error")).toBeDefined();
    expect(screen.getByText("Auth failed")).toBeDefined();
  });

  it.each([true, false])("renders the sign-in landing when signed out (afterSignOut=%s)", (a) => {
    renderAt({ phase: "signed-out", afterSignOut: a }, "/gen/callback");
    expect(screen.getByTestId("login-landing")).toBeDefined();
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("keeps a way back to the site (header home link + footer) on the error screen", () => {
    renderAt({ phase: "error", error: new Error("Auth failed"), onCallback: false });
    expect(screen.getByRole("link", { name: "MBE" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("contentinfo")).toBeDefined();
  });

  it("keeps a way back to the site (header home link + footer) on the session-expired screen", () => {
    renderAt({ phase: "expired" });
    expect(screen.getByRole("link", { name: "MBE" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("contentinfo")).toBeDefined();
  });

  it("renders a session-expired screen whose Sign In re-enters sign-in", () => {
    renderAt({ phase: "expired" }, "/gen/playground");
    expect(screen.getByText("Session expired")).toBeDefined();
    expect(screen.queryByTestId("outlet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("renders the Outlet when ready", () => {
    renderAt({ phase: "ready" });
    expect(screen.getByTestId("outlet")).toBeDefined();
  });

  it.each([{ phase: "signed-out", afterSignOut: false }, { phase: "expired" }] as const)(
    "renders shared spec URLs without requiring auth ($phase)",
    (gate) => {
      renderAt(gate, "/gen/s/abc123");
      expect(screen.getByTestId("outlet")).toBeDefined();
      expect(screen.queryByTestId("login-landing")).toBeNull();
    }
  );

  it("still surfaces an auth error on a shared spec URL", () => {
    renderAt({ phase: "error", error: new Error("Auth failed"), onCallback: false }, "/gen/s/x");
    expect(screen.getByText("Authentication Error")).toBeDefined();
  });
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

describe("CallbackRedirect", () => {
  it("navigates to the returnTo carried through sign-in", () => {
    mockSigninReturnTo.mockReturnValue("/playground?spec=abc");
    render(
      <MemoryRouter initialEntries={["/callback"]}>
        <Routes>
          <Route path="/callback" element={<CallbackRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId("location").textContent).toBe("/playground?spec=abc");
  });
});
