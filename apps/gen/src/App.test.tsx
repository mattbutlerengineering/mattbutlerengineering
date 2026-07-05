 
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ElementType, ReactNode } from "react";
import { App, CallbackRedirect } from "./App.js";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: ReactNode }) => <div data-testid="stack">{children}</div>,
  Text: ({ children, as: As = "span" }: { children: ReactNode; as?: ElementType }) => (
    <As>{children}</As>
  ),
  Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// The logged-out landing is covered in depth by LoginLanding.test.tsx; here we
// only assert that App routes to it when unauthenticated.
vi.mock("./components/LoginLanding.js", () => ({
  LoginLanding: () => <div data-testid="login-landing" />,
}));

import { useAuth } from "@mbe/auth/react";

const mockUseAuth = useAuth as unknown as Mock;

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state when isLoading is true", () => {
    mockUseAuth.mockReturnValue({
      isLoading: true,
      isAuthenticated: false,
      error: null,
    });
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("shows authentication error when error is present", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: new Error("Auth failed"),
    });
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText("Authentication Error")).toBeDefined();
    expect(screen.getByText("Auth failed")).toBeDefined();
  });

  it("renders the logged-out landing when not authenticated and not loading", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });
    render(
      <MemoryRouter initialEntries={["/gen"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByTestId("login-landing")).toBeDefined();
  });

  it("renders Outlet when authenticated", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.queryByText("Loading...")).toBeNull();
    expect(screen.queryByText("Authentication Error")).toBeNull();
    expect(screen.queryByTestId("login-landing")).toBeNull();
  });

  it("shows loading during callback path when not authenticated", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/gen/callback" },
      writable: true,
    });
    render(
      <MemoryRouter initialEntries={["/gen/callback"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText("Loading...")).toBeDefined();
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/" },
      writable: true,
    });
  });

  it("renders Outlet for shared spec URLs without requiring auth", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/gen/s/abc123" },
      writable: true,
    });
    render(
      <MemoryRouter initialEntries={["/gen/s/abc123"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("login-landing")).toBeNull();
    Object.defineProperty(window, "location", {
      value: { ...window.location, pathname: "/" },
      writable: true,
    });
  });
});

describe("CallbackRedirect", () => {
  it("renders without crashing inside a router", () => {
    render(
      <MemoryRouter>
        <CallbackRedirect />
      </MemoryRouter>
    );
  });
});
