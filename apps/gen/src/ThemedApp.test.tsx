import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemedApp } from "./ThemedApp.js";

vi.mock("./contexts/ThemeContext.js", () => ({
  useTheme: () => ({ theme: "light" as const, toggleTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  RialtoProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rialto-provider">{children}</div>
  ),
  ToastProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="toast-provider">{children}</div>
  ),
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="error-boundary">{children}</div>
  ),
}));

vi.mock("@mbe/auth/react", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));

vi.mock("react-router-dom", () => ({
  RouterProvider: () => <div data-testid="router-provider" />,
}));

vi.mock("./router.js", () => ({
  router: {},
}));

describe("ThemedApp", () => {
  it("renders without crashing", () => {
    render(<ThemedApp />);
    expect(screen.getByTestId("rialto-provider")).toBeDefined();
  });

  it("wraps content in RialtoProvider", () => {
    render(<ThemedApp />);
    expect(screen.getByTestId("rialto-provider")).toBeDefined();
  });

  it("wraps content in ToastProvider", () => {
    render(<ThemedApp />);
    expect(screen.getByTestId("toast-provider")).toBeDefined();
  });

  it("wraps content in AuthProvider", () => {
    render(<ThemedApp />);
    expect(screen.getByTestId("auth-provider")).toBeDefined();
  });

  it("wraps content in ErrorBoundary", () => {
    render(<ThemedApp />);
    expect(screen.getByTestId("error-boundary")).toBeDefined();
  });

  it("renders RouterProvider inside the provider tree", () => {
    render(<ThemedApp />);
    expect(screen.getByTestId("router-provider")).toBeDefined();
  });
});
