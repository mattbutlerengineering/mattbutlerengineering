/* eslint-disable @typescript-eslint/no-explicit-any */
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPage.js";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockApiClient = {
  users: {
    me: vi.fn(),
    update: vi.fn(),
    updatePreferences: vi.fn(),
    list: vi.fn(),
  },
};

vi.mock("../hooks/useApiClient.js", () => ({
  useApiClient: vi.fn(() => mockApiClient),
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

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><AdminPage /></Wrapper>);
}

const defaultUsers = [
  {
    id: "u1",
    name: "Admin User",
    email: "admin@example.com",
    emailVerified: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    preferences: { theme: "dark" },
  },
  {
    id: "u2",
    name: "Regular User",
    email: "user@example.com",
    emailVerified: false,
    createdAt: "2026-03-15T00:00:00Z",
    updatedAt: "2026-03-15T00:00:00Z",
    preferences: {},
  },
];

describe("AdminPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockApiClient.users.list.mockResolvedValue({
      data: defaultUsers,
      pagination: { total: 2, totalPages: 1, page: 1, limit: 10, hasNext: false },
    });
  });

  it("renders the admin page header", async () => {
    renderPage();
    expect(screen.getByText("Admin")).toBeDefined();
  });

  it("renders user list after loading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText("Admin User").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Regular User").length).toBeGreaterThan(0);
  });

  it("renders status filter segments", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("segmented-control")).toBeDefined();
    });
    expect(screen.getByTestId("segment-all")).toBeDefined();
    expect(screen.getByTestId("segment-verified")).toBeDefined();
    expect(screen.getByTestId("segment-unverified")).toBeDefined();
  });

  it("renders search input", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("search-input")).toBeDefined();
    });
  });

  it("renders user stats", async () => {
    renderPage();
    await waitFor(() => {
      const stats = screen.getAllByTestId("stat");
      expect(stats.length).toBeGreaterThan(0);
    });
  });

  it("shows loading skeleton while fetching", () => {
    mockApiClient.users.list.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  });

  it("shows error state when fetch fails", async () => {
    mockApiClient.users.list.mockRejectedValue(new Error("Server error"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeDefined();
    });
    expect(screen.getByText("Server error")).toBeDefined();
  });
});
