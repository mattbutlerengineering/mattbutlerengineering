import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FloorPlan, Table } from "@mbe/types";
import { RehearsalFloorPlan } from "./RehearsalFloorPlan.js";

vi.mock("../floor-plan", () => ({
  FloorPlanCanvas: (props: {
    readOnly?: boolean;
    tableStatuses?: ReadonlyMap<string, string>;
    onTableMove: unknown;
  }) => (
    <div
      data-testid="canvas"
      data-readonly={String(props.readOnly === true)}
      data-statuses={[...(props.tableStatuses?.values() ?? [])].join(",")}
    />
  ),
}));

const TABLES = [
  { id: "t1", name: "1", capacity: 2, minCovers: 1 },
  { id: "t2", name: "2", capacity: 4, minCovers: 2 },
  { id: "t3", name: "3", capacity: 6, minCovers: 4 },
] as Table[];

const PLAN = {
  id: "fp-1",
  venueId: "v1",
  name: "Main",
  isActive: true,
  layoutJson: { width: 800, height: 600, walls: [] },
  tables: TABLES,
} as unknown as FloorPlan;

describe("RehearsalFloorPlan", () => {
  it("shows the rehearsal banner over a read-only canvas", () => {
    render(<RehearsalFloorPlan floorPlan={PLAN} />);
    expect(screen.getByTestId("rehearsal-banner")).toBeInTheDocument();
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-readonly", "true");
  });

  it("cycles table statuses as the clock advances", () => {
    vi.stubGlobal(
      "matchMedia",
      vi
        .fn()
        .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    );
    render(<RehearsalFloorPlan floorPlan={PLAN} />);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const status of (screen.getByTestId("canvas").getAttribute("data-statuses") ?? "").split(
        ","
      )) {
        if (status) seen.add(status);
      }
      fireEvent.click(screen.getByRole("button", { name: "Next event" }));
    }
    vi.unstubAllGlobals();
    expect(seen).toContain("seated");
    expect(seen).toContain("needs-bussing");
  });
});
