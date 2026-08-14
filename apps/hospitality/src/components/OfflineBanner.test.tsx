import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner.js";

describe("OfflineBanner", () => {
  it("renders with role=status and data-testid=offline-banner", () => {
    render(<OfflineBanner lastSyncedAt={1_700_000_000_000} />);

    const banner = screen.getByTestId("offline-banner");
    expect(banner).toBeDefined();
    expect(banner.getAttribute("role")).toBe("status");
  });

  it("shows the fixed banner copy", () => {
    render(<OfflineBanner lastSyncedAt={1_700_000_000_000} />);

    expect(screen.getByText(/Showing cached data from last sync/)).toBeDefined();
  });

  it("shows a human-readable last-synced timestamp when lastSyncedAt is provided", () => {
    render(<OfflineBanner lastSyncedAt={new Date("2026-08-14T18:30:00.000Z").getTime()} />);

    const banner = screen.getByTestId("offline-banner");
    // Exact wall-clock format is locale/timezone dependent — assert the
    // fixed copy is present and something beyond it (a timestamp) is too,
    // rather than asserting an exact rendered clock string.
    expect(banner.textContent).toMatch(/Showing cached data from last sync/);
    expect(banner.textContent?.length).toBeGreaterThan("Showing cached data from last sync".length);
  });

  it("omits a fabricated timestamp when lastSyncedAt is undefined", () => {
    render(<OfflineBanner lastSyncedAt={undefined} />);

    const banner = screen.getByTestId("offline-banner");
    expect(banner.textContent).toBe("Showing cached data from last sync");
  });

  it("renders identical content across re-renders with the same lastSyncedAt (stable live-region content)", () => {
    const { rerender } = render(<OfflineBanner lastSyncedAt={1_700_000_000_000} />);
    const firstText = screen.getByTestId("offline-banner").textContent;

    rerender(<OfflineBanner lastSyncedAt={1_700_000_000_000} />);
    const secondText = screen.getByTestId("offline-banner").textContent;

    expect(secondText).toBe(firstText);
  });
});
