import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ElementType, ReactNode } from "react";
import { StatusPage } from "./StatusPage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
  Text: ({
    as: Tag = "p",
    children,
    className,
  }: {
    as?: ElementType;
    children?: ReactNode;
    className?: string;
  }) => <Tag className={className}>{children}</Tag>,
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

  it("keeps a long version hash in a truncating monospace element", async () => {
    const version = "77f84aca5c5c2c53b92df10b9a3390abcdef12";
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", version }),
    });
    render(<StatusPage />);
    const versions = await screen.findAllByText(`v${version}`, { selector: "code" });
    // Full hash stays in the accessibility tree and on the tooltip, even when
    // the visible line ellipsizes inside the card.
    expect(versions[0]).toHaveAttribute("title", `v${version}`);
    expect(versions[0]?.tagName).toBe("CODE");
    expect(versions[0]?.parentElement?.tagName).toBe("P");
    const css = readFileSync(join(__dirname, "StatusPage.module.css"), "utf8");
    const versionRule = css.match(/\.version\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(versionRule).toMatch(/font-family:\s*var\(--rialto-font-mono\)/);
    const cardRule = css.match(/\.card\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(cardRule).toMatch(/min-width:\s*0/);
    const metaRule = css.match(/\.meta\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(metaRule).toMatch(/overflow:\s*hidden/);
    expect(metaRule).toMatch(/text-overflow:\s*ellipsis/);
    expect(metaRule).toMatch(/white-space:\s*nowrap/);
    expect(metaRule).toMatch(/min-width:\s*0/);
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
