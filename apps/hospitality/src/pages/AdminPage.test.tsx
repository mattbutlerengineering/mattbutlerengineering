/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPage.js";
import { useAuth } from "@mbe/auth/react";
import React from "react";

const { mockUsersList } = vi.hoisted(() => ({
  mockUsersList: vi.fn(),
}));

vi.mock("@mbe/auth/react", () => ({ useAuth: vi.fn() }));
vi.mock("@mbe/api-client", () => ({
  ApiClient: vi.fn(function (this: any) {
    // no-op constructor
  }),
  UsersClient: vi.fn(function (this: any) {
    this.list = mockUsersList;
  }),
}));

vi.mock("../components/PageHeader", () => ({
  PageHeader: ({ title }: any) => <div data-testid="page-header">{title}</div>,
}));

vi.mock("@mattbutlerengineering/rialto", () => ({
  Alert: ({ children }: any) => <div data-testid="alert">{children}</div>,
  Avatar: ({ name }: any) => <div data-testid="avatar">{name}</div>,
  Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  Divider: () => <hr />,
  Input: (props: any) => (
    <input
      data-testid="search-input"
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
  Pagination: ({ total, page }: any) => (
    <div data-testid="pagination">
      {page}/{total}
    </div>
  ),
  SegmentedControl: ({ segments, value: _value, onChange }: any) => (
    <div data-testid="segmented-control">
      {segments?.map((s: any) => (
        <button key={s.id} data-testid={`segment-${s.id}`} onClick={() => onChange?.(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
  SkeletonGroup: ({ children }: any) => <div data-testid="skeleton-group">{children}</div>,
  Stat: ({ label, value }: any) => (
    <div data-testid="stat">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
  Text: ({ children }: any) => <span>{children}</span>,
}));

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      accessToken: "admin-token",
      user: { sub: "admin-1", name: "Admin" },
    } as any);

    mockUsersList.mockResolvedValue({
      data: [
        {
          id: "u1",
          name: "Admin User",
          email: "admin@example.com",
          role: "admin",
          emailVerified: true,
          createdAt: "2026-01-01T00:00:00Z",
          preferences: { theme: "dark" },
        },
        {
          id: "u2",
          name: "Regular User",
          email: "user@example.com",
          role: "user",
          emailVerified: false,
          createdAt: "2026-03-15T00:00:00Z",
          preferences: {},
        },
      ],
      pagination: { total: 2, page: 1, limit: 10 },
    });
  });

  it("renders the admin page header", async () => {
    render(<AdminPage />);
    expect(screen.getByText("Admin")).toBeDefined();
  });

  it("renders user list after loading", async () => {
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Admin User").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Regular User").length).toBeGreaterThan(0);
  });

  it("renders status filter segments", async () => {
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByTestId("segmented-control")).toBeDefined();
    });
    expect(screen.getByTestId("segment-all")).toBeDefined();
    expect(screen.getByTestId("segment-verified")).toBeDefined();
    expect(screen.getByTestId("segment-unverified")).toBeDefined();
  });

  it("renders search input", async () => {
    render(<AdminPage />);
    await waitFor(() => {
      expect(screen.getByTestId("search-input")).toBeDefined();
    });
  });

  it("renders user stats", async () => {
    render(<AdminPage />);
    await waitFor(() => {
      const stats = screen.getAllByTestId("stat");
      expect(stats.length).toBeGreaterThan(0);
    });
  });
});
