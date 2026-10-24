import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Table } from "@mbe/types";
import { RehearsalTimeline } from "./RehearsalTimeline.js";

vi.mock("../timeline", () => ({
  TimelineGrid: (props: {
    reservations: unknown[];
    onReservationClick?: unknown;
    onTableStatusChange?: unknown;
  }) => (
    <div
      data-testid="grid"
      data-count={props.reservations.length}
      data-clickable={String(props.onReservationClick !== undefined)}
      data-editable={String(props.onTableStatusChange !== undefined)}
    />
  ),
}));

const TABLES = [
  { id: "t1", name: "1", capacity: 2, minCovers: 1 },
  { id: "t2", name: "2", capacity: 4, minCovers: 2 },
  { id: "t3", name: "3", capacity: 6, minCovers: 4 },
] as Table[];

describe("RehearsalTimeline", () => {
  it("always shows the rehearsal banner", () => {
    render(<RehearsalTimeline tables={TABLES} date="2026-10-24" />);
    expect(screen.getByTestId("rehearsal-banner")).toBeInTheDocument();
  });

  it("is read-only: the grid gets no click-through or status handlers", () => {
    render(<RehearsalTimeline tables={TABLES} date="2026-10-24" />);
    const grid = screen.getByTestId("grid");
    expect(grid).toHaveAttribute("data-clickable", "false");
    expect(grid).toHaveAttribute("data-editable", "false");
  });

  it("renders the simulation's reservations as the clock advances", () => {
    vi.stubGlobal(
      "matchMedia",
      vi
        .fn()
        .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
    render(<RehearsalTimeline tables={TABLES} date="2026-10-24" />);
    let seen = 0;
    for (let i = 0; i < 300; i++) {
      seen = Math.max(seen, Number(screen.getByTestId("grid").getAttribute("data-count")));
      fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    }
    vi.unstubAllGlobals();
    expect(seen).toBeGreaterThan(0);
  });
});

describe("rehearsal module guard", () => {
  it("imports no api-client", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/@mbe\/api-client|useApiClient/);
    }
  });
});
