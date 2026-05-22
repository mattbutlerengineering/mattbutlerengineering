/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { SystemHealthBadge } from "./SystemHealthBadge.js";
import { useAuth } from "@mbe/auth/react";
import { useApiClient } from "../hooks/useApiClient.js";
import React from "react";

vi.mock("@mbe/auth/react", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(),
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Badge: ({ children, color }: { children: React.ReactNode; color?: string }) => (
    <span data-testid="badge" data-color={color}>
      {children}
    </span>
  ),
  Button: ({
    children,
    ...props
  }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Popover: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <div data-testid="popover">
      {trigger}
      <div data-testid="popover-content">{children}</div>
    </div>
  ),
  Text: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

function makeApiClient(overrides: Record<string, unknown> = {}) {
  return {
    health: {
      getSystemHealth: vi.fn(),
    },
    ...overrides,
  };
}

describe("SystemHealthBadge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing for non-admin users", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: [] } },
    } as any);
    vi.mocked(useApiClient).mockReturnValue(makeApiClient() as any);

    const { container } = render(<SystemHealthBadge />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user has no permissions", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: {} },
    } as any);
    vi.mocked(useApiClient).mockReturnValue(makeApiClient() as any);

    const { container } = render(<SystemHealthBadge />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when user is null", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
    } as any);
    vi.mocked(useApiClient).mockReturnValue(makeApiClient() as any);

    const { container } = render(<SystemHealthBadge />);
    expect(container.innerHTML).toBe("");
  });

  it("uses useApiClient hook instead of raw fetch", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: ["admin"] } },
    } as any);

    const mockGetSystemHealth = vi.fn().mockResolvedValue({
      status: "healthy",
      timestamp: "2026-01-15T12:00:00Z",
    });
    vi.mocked(useApiClient).mockReturnValue(
      makeApiClient({ health: { getSystemHealth: mockGetSystemHealth } }) as any
    );

    await act(async () => {
      render(<SystemHealthBadge />);
    });

    await waitFor(() => {
      expect(mockGetSystemHealth).toHaveBeenCalled();
    });

    // Verify useApiClient hook was called (not raw fetch)
    expect(useApiClient).toHaveBeenCalled();
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

    const mockGetSystemHealth = vi.fn().mockResolvedValue(healthData);
    vi.mocked(useApiClient).mockReturnValue(
      makeApiClient({ health: { getSystemHealth: mockGetSystemHealth } }) as any
    );

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

    const mockGetSystemHealth = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.mocked(useApiClient).mockReturnValue(
      makeApiClient({ health: { getSystemHealth: mockGetSystemHealth } }) as any
    );

    await act(async () => {
      render(<SystemHealthBadge />);
    });

    // Should render nothing since health is null after fetch failure
    expect(screen.queryByTestId("popover")).toBeNull();
  });

  it("handles API error silently", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: ["admin"] } },
    } as any);

    const mockGetSystemHealth = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("500 Service Unavailable"), { statusCode: 500 }));
    vi.mocked(useApiClient).mockReturnValue(
      makeApiClient({ health: { getSystemHealth: mockGetSystemHealth } }) as any
    );

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

    const mockGetSystemHealth = vi.fn().mockResolvedValue(healthData);
    vi.mocked(useApiClient).mockReturnValue(
      makeApiClient({ health: { getSystemHealth: mockGetSystemHealth } }) as any
    );

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

describe("SystemHealthBadge — polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls health every 60 seconds", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { raw: { permissions: ["admin"] } },
    } as any);

    const mockGetSystemHealth = vi.fn().mockResolvedValue({
      status: "healthy",
      timestamp: "2026-01-15T12:00:00Z",
    });
    vi.mocked(useApiClient).mockReturnValue(
      makeApiClient({ health: { getSystemHealth: mockGetSystemHealth } }) as any
    );

    await act(async () => {
      render(<SystemHealthBadge />);
    });

    const initialCalls = mockGetSystemHealth.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(mockGetSystemHealth.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});
