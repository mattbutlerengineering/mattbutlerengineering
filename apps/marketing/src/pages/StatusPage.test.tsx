import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { StatusPage } from "./StatusPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Skeleton: () => <div data-testid="skeleton" />,
  Icon: () => <div />,
  Spinner: () => <div data-testid="spinner" />,
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("StatusPage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders loading state", () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<StatusPage />);
    expect(screen.getAllByTestId("spinner").length).toBeGreaterThan(0);
  });

  it("renders error status when fetch is rejected", async () => {
    mockFetch.mockRejectedValue(new Error("Network Error"));
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Down").length).toBeGreaterThan(0);
    });
    // Page must stay mounted — key elements still present
    expect(screen.getByText("Users API")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });

  it("renders error status for a row when fetch returns non-ok response", async () => {
    // All fetches return non-ok (e.g., 503)
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getAllByText("Down").length).toBeGreaterThan(0);
    });
    // Page must stay mounted
    expect(screen.getByText("Reservations API")).toBeInTheDocument();
    expect(screen.getByText("Hospitality")).toBeInTheDocument();
  });

  it("renders the version in a no-wrap monospace element", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", version: "a1b2c3d4e5f6" }),
    });
    render(<StatusPage />);
    const versions = await screen.findAllByText("va1b2c3d4e5f6", { selector: "code" });
    expect(versions[0]?.tagName).toBe("CODE");
    const css = readFileSync(join(__dirname, "StatusPage.module.css"), "utf8");
    expect(css).toMatch(/\.version\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.version\s*\{[^}]*var\(--rialto-font-mono\)/);
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
