/* eslint-disable @typescript-eslint/no-explicit-any, react/jsx-no-undef */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { SystemHealthBadge } from "./SystemHealthBadge.js";
import { useAuth } from "@mbe/auth/react";
import React from "react";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({ children, color }: { children: React.ReactNode; color?: string }) => (
    <span data-testid="badge" data-color={color}>
      {children}
    </span>
  ),
  Popover: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <div data-testid="popover">
      {trigger}
      <div data-testid="popover-content">{children}</div>
    </div>
  ),
}));

describe("SystemHealthBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing for non-admin users", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: [] } },
    } as any);

    const { container } = render(<SystemHealthBadge />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user has no permissions", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: {} },
    } as any);

    const { container } = render(<SystemHealthBadge />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user is null", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
    } as any);

    const { container } = render(<SystemHealthBadge />);
    expect(container.innerHTML).toBe("");
  });

  it("fetches health data for admin users and renders badge", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: ["admin"] } },
    } as any);

    const healthData = {
      status: "healthy",
      timestamp: "2026-01-15T12:00:00Z",
      services: {
        "users-api": { status: "healthy", latency: 42 },
        "reservations-api": { status: "degraded", latency: 150 },
      },
      ci: { status: "healthy" },
      deploy: { status: "healthy" },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    });

    await act(async () => {
      render(<SystemHealthBadge />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("popover")).toBeDefined();
    });

    expect(screen.getByLabelText("System health: healthy")).toBeDefined();
    expect(screen.getByText("System Health")).toBeDefined();
    expect(screen.getByText("healthy")).toBeDefined();
    expect(screen.getByText("users-api")).toBeDefined();
    expect(screen.getByText("reservations-api")).toBeDefined();
    expect(screen.getByText("42ms")).toBeDefined();
    expect(screen.getByText("150ms")).toBeDefined();
    expect(screen.getByText("CI")).toBeDefined();
    expect(screen.getByText("Deploys")).toBeDefined();
  });

  it("handles fetch failure silently", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: ["admin"] } },
    } as any);

    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await act(async () => {
      render(<SystemHealthBadge />);
    });

    // Should render nothing since health is null after fetch failure
    expect(screen.queryByTestId("popover")).toBeNull();
  });

  it("handles non-ok response silently", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: ["admin"] } },
    } as any);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    await act(async () => {
      render(<SystemHealthBadge />);
    });

    expect(screen.queryByTestId("popover")).toBeNull();
  });

  it("renders without services/ci/deploy sections when absent", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: ["admin"] } },
    } as any);

    const healthData = {
      status: "healthy",
      timestamp: "2026-01-15T12:00:00Z",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthData),
    });

    await act(async () => {
      render(<SystemHealthBadge />);
    });

    await waitFor(() => {
      expect(screen.getByTestId("popover")).toBeDefined();
    });

    expect(screen.queryByText("CI")).toBeNull();
    expect(screen.queryByText("Deploys")).toBeNull();
  });
});
