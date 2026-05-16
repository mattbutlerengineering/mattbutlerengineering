/* eslint-disable mbe-local/prefer-rialto-components */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App, CallbackRedirect } from "./App.js";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div data-testid="stack">{children}</div>,
  Text: ({
    children,
    as: As = "span",
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    variant?: string;
    color?: string;
    className?: string;
  }) => <As>{children}</As>,
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => <button onClick={onClick}>{children}</button>,
  AuthMascot: ({ state }: { state: string }) => (
    <div data-testid="auth-mascot" data-state={state} />
  ),
}));

vi.mock("./App.module.css", () => ({
  default: {
    loginContainer: "loginContainer",
  },
}));

import { useAuth } from "@mbe/auth/react";

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

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

  it("shows login prompt when not authenticated and not loading", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: null,
      signIn: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={["/gen"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText("Gen Playground")).toBeDefined();
    expect(screen.getByText("Please sign in to continue")).toBeDefined();
    expect(screen.getByText("Sign In")).toBeDefined();
  });

  it("shows AuthMascot in login prompt", () => {
    mockUseAuth.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      error: null,
      signIn: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={["/gen"]}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByTestId("auth-mascot")).toBeDefined();
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
    expect(screen.queryByText("Gen Playground")).toBeNull();
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
    expect(screen.queryByText("Gen Playground")).toBeNull();
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
