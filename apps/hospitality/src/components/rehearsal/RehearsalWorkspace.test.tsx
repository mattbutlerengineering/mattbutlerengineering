import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FloorPlan, Table } from "@mbe/types";
import type * as RialtoProviders from "@mattbutlerengineering/rialto/providers";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock("@mattbutlerengineering/rialto/providers", async (importOriginal) => {
  const actual = await importOriginal<typeof RialtoProviders>();
  return {
    ...actual,
    useMotionPreset: () => ({ ...actual.useMotionPreset(), reduced: motion.reduced }),
  };
});

vi.mock("react-konva", () => ({
  Stage: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="konva-stage">{children}</div>
  ),
  Layer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../floor-plan/TableShape", () => ({
  TableShape: ({ table, status }: { table: Table; status?: string }) => (
    <div data-testid={`table-shape-${table.id}`} data-status={status}>
      {table.name}
    </div>
  ),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import { RehearsalWorkspace } from "./RehearsalWorkspace";
import { simulateService } from "./simulate-service";
import { rehearsalMetrics } from "./rehearsal-state";

const FLOOR_PLAN: FloorPlan = {
  id: "fp-1",
  venueId: "venue-1",
  name: "Main Dining",
  isActive: true,
  layoutJson: { width: 800, height: 600 },
  tables: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function makeTable(id: string, capacity: number, floorPlanId = "fp-1"): Table {
  return {
    id,
    name: `Table ${id}`,
    tableNumber: id.toUpperCase(),
    capacity,
    minCovers: 1,
    maxCovers: capacity,
    location: null,
    isActive: true,
    priority: 0,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId,
    shapeMetadata: { x: 100, y: 100, width: 80, height: 60, shape: "rectangle" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const TABLES: Table[] = [
  ...["a", "b", "c", "d"].map((id) => makeTable(id, 2)),
  ...["e", "f", "g", "h"].map((id) => makeTable(id, 4)),
  makeTable("i", 6),
  makeTable("j", 6, "fp-other"),
];
const OPEN = 17 * 60;
const CLOSE = 23 * 60;
const EVENTS = simulateService({
  tables: TABLES,
  openMinute: OPEN,
  closeMinute: CLOSE,
  profile: "friday",
  seed: 21,
});
const ANCHOR = new Date(2026, 9, 19, 12, 0, 0);

const props = () => ({
  events: EVENTS,
  tables: TABLES,
  floorPlan: FLOOR_PLAN,
  profile: "friday" as const,
  seed: 21,
  openMinute: OPEN,
  closeMinute: CLOSE,
  anchor: ANCHOR,
  onLeave: vi.fn(),
  onRunAgain: vi.fn(),
  onTryOther: vi.fn(),
});

beforeEach(() => {
  motion.reduced = false;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const scrubTo = (minute: number) =>
  fireEvent.change(screen.getByRole("slider", { name: "Scrub through the night" }), {
    target: { value: String(minute) },
  });

describe("RehearsalWorkspace banner and views (SC-8)", () => {
  it("shows the rehearsal banner in the Timeline view and keeps it through a view switch", async () => {
    render(<RehearsalWorkspace {...props()} />);
    const banner = screen.getByRole("note", { name: "Rehearsal notice" });
    expect(banner).toHaveTextContent("Rehearsal, not real bookings. Nothing here is saved.");
    expect(within(banner).getByText("Rehearsal")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Floor plan" }));
    expect(screen.getByRole("note", { name: "Rehearsal notice" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Floor plan" })).toBeChecked();
  });

  it("calls onLeave from the banner", async () => {
    const p = props();
    render(<RehearsalWorkspace {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Leave rehearsal" }));
    expect(p.onLeave).toHaveBeenCalledTimes(1);
  });

  it("keeps the playback position when switching views", async () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60 + 30);
    expect(screen.getByRole("heading", { name: /Friday night · 7:30 PM/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Floor plan" }));
    expect(screen.getByRole("heading", { name: /Friday night · 7:30 PM/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Timeline" }));
    expect(screen.getByRole("heading", { name: /Friday night · 7:30 PM/ })).toBeInTheDocument();
  });

  it("states that the night is about to start before the first booking", () => {
    const p = { ...props(), events: [] };
    render(<RehearsalWorkspace {...p} />);
    expect(screen.getByText("The night is about to start.")).toBeInTheDocument();
  });
});

describe("RehearsalWorkspace timeline view", () => {
  it("draws simulated parties as non-buttons named Party of N, with no real guest data", () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60 + 30);
    const blocks = screen.getAllByTestId(/^reservation-block-rehearsal-21-/);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.tagName).toBe("DIV");
      expect(block).toHaveTextContent(/Party of \d/);
    }
    expect(screen.queryByRole("button", { name: /Party of/ })).toBeNull();
  });

  it("does nothing when a block is clicked and offers no status menu", async () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60 + 30);
    const [block] = screen.getAllByTestId(/^reservation-block-rehearsal-21-/);
    await userEvent.click(block as HTMLElement);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("button", { name: /change status/i })).toBeNull();
  });

  it("shows the Right now sentence with plural counts", () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60 + 30);
    expect(screen.getByText(/tables? occupied\./)).toBeInTheDocument();
    expect(screen.getByText(/Right now/)).toBeInTheDocument();
  });
});

describe("RehearsalWorkspace floor plan view", () => {
  it("exposes the canvas as an image labelled with the Right now sentence", async () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60 + 30);
    await userEvent.click(screen.getByRole("radio", { name: "Floor plan" }));
    const img = screen.getByRole("img", { name: /tables? occupied\./ });
    expect(img).toBeInTheDocument();
  });

  it("colours the plan's own tables and leaves other plans' tables off the canvas", async () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60 + 30);
    await userEvent.click(screen.getByRole("radio", { name: "Floor plan" }));
    expect(screen.getByTestId("table-shape-a")).toHaveAttribute("data-status");
    expect(screen.queryByTestId("table-shape-j")).toBeNull();
    const statuses = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) =>
      screen.getByTestId(`table-shape-${id}`).getAttribute("data-status")
    );
    expect(statuses).toContain("seated");
    expect(statuses.every((s) => ["seated", "needs-bussing", "available"].includes(s ?? ""))).toBe(
      true
    );
  });

  it("lists the legend by word, not colour alone", async () => {
    render(<RehearsalWorkspace {...props()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Floor plan" }));
    const legend = screen.getByRole("list", { name: "Table status" });
    for (const word of ["Available", "Occupied", "Needs bussing"]) {
      expect(within(legend).getByText(word)).toBeInTheDocument();
    }
  });

  it("does not move or select anything when a table is clicked", async () => {
    render(<RehearsalWorkspace {...props()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Floor plan" }));
    await userEvent.click(screen.getByTestId("table-shape-a"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("RehearsalWorkspace transport", () => {
  it("names every control and is keyboard operable", async () => {
    render(<RehearsalWorkspace {...props()} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    const speeds = screen.getByRole("radiogroup", { name: "Playback speed" });
    for (const label of ["15x", "60x", "240x"]) {
      expect(within(speeds).getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "60x" })).toBeChecked();
    expect(screen.getByRole("slider", { name: "Scrub through the night" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    await userEvent.click(within(speeds).getByRole("radio", { name: "240x" }));
    expect(screen.getByRole("radio", { name: "240x" })).toBeChecked();
  });

  it("offers Replay from start at the end of the night", () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(CLOSE);
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Scrub through the night" }));
    expect(screen.getByRole("button", { name: "Replay from start" })).toBeInTheDocument();
  });

  it("has exactly one polite live region", () => {
    render(<RehearsalWorkspace {...props()} />);
    const regions = document.querySelectorAll("[aria-live]");
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAttribute("aria-live", "polite");
  });

  it("announces the state when the owner pauses", async () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60 + 30);
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Scrub through the night" }));
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    const region = document.querySelector("[aria-live]") as HTMLElement;
    expect(region.textContent).toMatch(/7:30 PM\. .*occupied\./);
  });
});

describe("RehearsalWorkspace reduced motion (SC-11)", () => {
  beforeEach(() => {
    motion.reduced = true;
  });

  it("starts paused with step controls, a hint, and no speed control", () => {
    render(<RehearsalWorkspace {...props()} />);
    expect(
      screen.getByText("Motion is reduced. Step through the night with Next event.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Playback speed" })).toBeNull();
  });

  it("steps to the next event and announces what changed", async () => {
    render(<RehearsalWorkspace {...props()} />);
    await userEvent.click(screen.getByRole("button", { name: "Next event" }));
    const region = document.querySelector("[aria-live]") as HTMLElement;
    expect(region.textContent).toMatch(/Party of \d/);
  });
});

describe("RehearsalWorkspace curtain call (SC-7)", () => {
  const finishNight = () => {
    scrubTo(CLOSE);
    fireEvent.pointerUp(screen.getByRole("slider", { name: "Scrub through the night" }));
  };

  it("does not appear mid-night", () => {
    render(<RehearsalWorkspace {...props()} />);
    scrubTo(19 * 60);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens at close with the metrics of the same events", () => {
    render(<RehearsalWorkspace {...props()} />);
    finishNight();
    const dialog = screen.getByRole("dialog", { name: "Your Friday night" });
    const metrics = rehearsalMetrics(
      EVENTS,
      TABLES.map((table) => table.id)
    );
    const row = (label: string) => within(dialog).getByText(label).closest("div") as HTMLElement;
    expect(row("Covers served")).toHaveTextContent(String(metrics.coversServed));
    expect(metrics.coversServed).toBeGreaterThan(0);
    expect(within(dialog).getByRole("heading", { name: "Your Friday night" })).toHaveFocus();
    expect(screen.getByRole("note", { name: "Rehearsal notice" })).toBeInTheDocument();
  });

  it("announces the end of service once", () => {
    render(<RehearsalWorkspace {...props()} />);
    finishNight();
    const region = document.querySelector("[aria-live]") as HTMLElement;
    expect(region.textContent).toMatch(/^Service is over\. Covers served: \d+\.$/);
  });

  it("ignores Escape, closes to a paused workspace, and can be shown again", async () => {
    render(<RehearsalWorkspace {...props()} />);
    finishNight();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Close summary" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Replay from start" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show curtain call" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("hands Run it again, Try a weeknight and Leave to the page", async () => {
    const p = props();
    render(<RehearsalWorkspace {...p} />);
    finishNight();
    await userEvent.click(screen.getByRole("button", { name: "Run it again" }));
    expect(p.onRunAgain).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Try a weeknight" }));
    expect(p.onTryOther).toHaveBeenCalledWith("weeknight");
  });

  it("closes the card and restarts at open on Replay from start", async () => {
    render(<RehearsalWorkspace {...props()} />);
    finishNight();
    await userEvent.click(screen.getByRole("button", { name: "Close summary" }));
    await userEvent.click(screen.getByRole("button", { name: "Replay from start" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { name: /Friday night · 5:00 PM/ })).toBeInTheDocument();
  });
});
