import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StatusPage } from "./StatusPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children }: any) => <h1>{children}</h1>,
  Text: ({ children }: any) => <span>{children}</span>,
  Button: ({ children }: any) => <button>{children}</button>,
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Skeleton: () => <div data-testid="skeleton" />,
  Icon: () => <div />,
  Spinner: () => <div data-testid="spinner" />,
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("StatusPage", () => {
  it("renders loading state", () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<StatusPage />);
    expect(screen.getAllByTestId("spinner").length).toBeGreaterThan(0);
  });

  it("renders error state", async () => {
    mockFetch.mockRejectedValue(new Error("Network Error"));
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Down").length).toBeGreaterThan(0);
    });
  });

  it("renders healthy state", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "healthy",
        timestamp: "2026-05-08T12:00:00Z",
        services: {
          users: { status: "ok", version: "1.0.0", latency: 50 },
          reservations: { status: "ok", version: "1.0.0", latency: 50 },
          agent: { status: "ok", version: "1.0.0", latency: 50 },
        },
        staticSites: {
          marketing: { status: "ok", latency: 10 },
          hospitality: { status: "ok", latency: 10 },
          rialto: { status: "ok", latency: 10 },
        },
        ci: { status: "ok" },
        deploy: { status: "ok" },
      }),
    });
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Operational").length).toBeGreaterThan(0);
      expect(screen.getByText("Users API")).toBeInTheDocument();
      expect(screen.getByText("Marketing")).toBeInTheDocument();
    });
  });
});
