import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DraftTable, FloorPlanDraft } from "./floor-plan-draft.js";
import type { LaunchProgress } from "./launch-sequence.js";
import { INITIAL_LAUNCH_PROGRESS } from "./launch-sequence.js";
import { LaunchStagePanel } from "./LaunchStagePanel.js";

function makeDraftTable(overrides: Partial<DraftTable> = {}): DraftTable {
  return {
    localId: overrides.name ?? "T1",
    name: "T1",
    capacity: 4,
    minCovers: 1,
    shape: "rectangle",
    x: 100,
    y: 100,
    ...overrides,
  };
}

function makeTables(count: number): DraftTable[] {
  return Array.from({ length: count }, (_, i) =>
    makeDraftTable({ localId: `T${i + 1}`, name: `T${i + 1}` })
  );
}

function makeDraft(overrides: Partial<FloorPlanDraft> = {}): FloorPlanDraft {
  return {
    templateId: "template-1",
    planName: "Main Floor",
    tables: makeTables(14),
    pristine: false,
    ...overrides,
  };
}

const VENUE_NAME = "The Grand";

/** Full text of an element, ignoring how its children are split across nodes. */
function textOf(element: Element | null): string {
  return element?.textContent ?? "";
}

describe("LaunchStagePanel", () => {
  it("pending: renders four rows, all LEDs off, Tables reading '14 to place', no Progress", () => {
    render(
      <LaunchStagePanel
        progress={INITIAL_LAUNCH_PROGRESS}
        draft={makeDraft()}
        venueName={VENUE_NAME}
      />
    );

    const panel = screen.getByLabelText("Launch progress");
    const leds = panel.querySelectorAll("[data-variant]");
    expect(leds).toHaveLength(4);
    for (const led of leds) {
      expect(led).toHaveAttribute("data-variant", "off");
    }

    expect(screen.getByText("Venue")).toBeInTheDocument();
    expect(screen.getByText("Floor plan")).toBeInTheDocument();
    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(screen.getByText("Activate")).toBeInTheDocument();
    expect(screen.getByText("14 to place")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { hidden: true })).not.toBeInTheDocument();
  });

  it("mid-sequence: venue/floorPlan done, tables in flight, activate off, Progress at 43%", () => {
    const progress: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      venueId: "venue-1",
      floorPlanId: "floor-plan-1",
      createdTableNames: ["T1", "T2", "T3", "T4", "T5", "T6"],
      inFlightStage: "tables",
    };
    render(<LaunchStagePanel progress={progress} draft={makeDraft()} venueName={VENUE_NAME} />);

    expect(screen.getByText(`${VENUE_NAME} created`)).toBeInTheDocument();
    expect(screen.getByText("Main Floor created")).toBeInTheDocument();
    expect(screen.getByText((_, el) => textOf(el) === "Placing table 7 of 14")).toBeInTheDocument();

    const panel = screen.getByLabelText("Launch progress");
    const leds = [...panel.querySelectorAll("[data-variant]")];
    expect(leds.map((led) => led.getAttribute("data-variant"))).toEqual([
      "success",
      "success",
      "accent",
      "off",
    ]);

    const progressBar = panel.querySelector('[role="progressbar"]');
    expect(progressBar).not.toBeNull();
    expect(progressBar).toHaveAttribute("aria-valuenow", "43");
  });

  it("failure at tables: exactly one row is danger, the two above stay success", () => {
    const progress: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      venueId: "venue-1",
      floorPlanId: "floor-plan-1",
      createdTableNames: ["T1", "T2", "T3", "T4", "T5", "T6"],
      failedStage: "tables",
      errorMessage: "Stopped at table 7 of 14",
    };
    render(<LaunchStagePanel progress={progress} draft={makeDraft()} venueName={VENUE_NAME} />);

    expect(
      screen.getByText((_, el) => textOf(el) === "Stopped at table 7 of 14")
    ).toBeInTheDocument();

    const panel = screen.getByLabelText("Launch progress");
    const leds = [...panel.querySelectorAll("[data-variant]")];
    expect(leds.map((led) => led.getAttribute("data-variant"))).toEqual([
      "success",
      "success",
      "danger",
      "off",
    ]);
    expect(leds.filter((led) => led.getAttribute("data-variant") === "danger")).toHaveLength(1);
  });

  it("failure at venue: nothing created, only the venue row is red", () => {
    const progress: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      failedStage: "venue",
      errorMessage: "Couldn't create the venue",
    };
    render(<LaunchStagePanel progress={progress} draft={makeDraft()} venueName={VENUE_NAME} />);

    const panel = screen.getByLabelText("Launch progress");
    const rows = panel.querySelector("ol") as HTMLElement;
    expect(within(rows).getByText("Couldn't create the venue")).toBeInTheDocument();

    const leds = [...panel.querySelectorAll("[data-variant]")];
    expect(leds.filter((led) => led.getAttribute("data-variant") === "danger")).toHaveLength(1);
    expect(leds[0]).toHaveAttribute("data-variant", "danger");
  });

  it("at N = 0: renders three rows and nothing matching /table/i", () => {
    render(
      <LaunchStagePanel
        progress={INITIAL_LAUNCH_PROGRESS}
        draft={makeDraft({ tables: [] })}
        venueName={VENUE_NAME}
      />
    );

    const panel = screen.getByLabelText("Launch progress");
    const leds = panel.querySelectorAll("[data-variant]");
    expect(leds).toHaveLength(3);
    expect(screen.queryByText(/table/i)).not.toBeInTheDocument();
  });

  it("complete: four success rows, Activate reads Live, no Progress", () => {
    const progress: LaunchProgress = {
      venueId: "venue-1",
      floorPlanId: "floor-plan-1",
      createdTableNames: makeTables(14).map((t) => t.name),
      activated: true,
      inFlightStage: null,
      failedStage: null,
      errorMessage: null,
    };
    render(<LaunchStagePanel progress={progress} draft={makeDraft()} venueName={VENUE_NAME} />);

    const panel = screen.getByLabelText("Launch progress");
    const leds = [...panel.querySelectorAll("[data-variant]")];
    expect(leds.map((led) => led.getAttribute("data-variant"))).toEqual([
      "success",
      "success",
      "success",
      "success",
    ]);
    const rows = panel.querySelector("ol") as HTMLElement;
    expect(within(rows).getByText("Live")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { hidden: true })).not.toBeInTheDocument();
  });

  it("root aria-label, one aria-live=polite region, per-table counter and Progress are aria-hidden", () => {
    const progress: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      venueId: "venue-1",
      floorPlanId: "floor-plan-1",
      createdTableNames: ["T1", "T2", "T3", "T4", "T5", "T6"],
      inFlightStage: "tables",
    };
    const { container } = render(
      <LaunchStagePanel progress={progress} draft={makeDraft()} venueName={VENUE_NAME} />
    );

    const panel = screen.getByLabelText("Launch progress");
    expect(panel).toBeInTheDocument();

    const liveRegions = container.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions).toHaveLength(1);

    const counter = screen.getByTestId("tables-counter");
    expect(counter).toHaveAttribute("aria-hidden", "true");

    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("re-render with a new table count (same stage) does not change the live region's text", () => {
    const base: LaunchProgress = {
      ...INITIAL_LAUNCH_PROGRESS,
      venueId: "venue-1",
      floorPlanId: "floor-plan-1",
      createdTableNames: ["T1", "T2", "T3", "T4", "T5", "T6"],
      inFlightStage: "tables",
    };
    const { container, rerender } = render(
      <LaunchStagePanel progress={base} draft={makeDraft()} venueName={VENUE_NAME} />
    );
    const before = textOf(container.querySelector('[aria-live="polite"]'));

    const later: LaunchProgress = {
      ...base,
      createdTableNames: [...base.createdTableNames, "T7", "T8"],
    };
    rerender(<LaunchStagePanel progress={later} draft={makeDraft()} venueName={VENUE_NAME} />);
    const after = textOf(container.querySelector('[aria-live="polite"]'));

    expect(after).toBe(before);
  });

  it("uses only rialto tokens for color — no hex or rgb() literals", () => {
    const cssPath = resolve(
      process.cwd(),
      "src/components/venue-onboarding/LaunchStagePanel.module.css"
    );
    const css = readFileSync(cssPath, "utf-8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgb\(/);
  });
});
