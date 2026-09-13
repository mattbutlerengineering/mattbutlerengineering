import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  AvailabilityHeatmapExamplePage,
  ROOMS,
  START_DATE,
  END_DATE,
  OCCUPANCY_DENSITY,
  buildMaintenanceBlocks,
  occupancyRatePercent,
} from "./AvailabilityHeatmapExamplePage.js";
import { makeReservations } from "../../data/tapechart-fixtures.js";

// ---------------------------------------------------------------------------
// Behavioral mock of @mattbutlerengineering/rialto.
//
// The real package resolves to an unbuilt dist in the worktree, so — like every
// other app test — we stub it. The TapeChart stub reports the props this page
// wires through it (room/reservation counts) and renders one button per
// reservation so a "cell" click can be driven the way a user drives it —
// mirroring the TapeChart stub in ../data/TapeChartPage.test.tsx.
// ---------------------------------------------------------------------------

vi.mock("@mattbutlerengineering/rialto", () => {
  const Select = ({
    label,
    options,
    value,
    onChange,
  }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <select aria-label={label} value={value} onChange={(e) => onChange?.(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  const Checkbox = ({
    label,
    checked,
    onCheckedChange,
  }: {
    label?: ReactNode;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
      />
      {label}
    </label>
  );

  type Reservation = { id: string; blockedReason?: string; guestName?: string };

  const TapeChart = ({
    rooms,
    reservations,
    onReservationClick,
    selectedReservationId,
  }: {
    rooms: { id: string }[];
    reservations: Reservation[];
    onReservationClick?: (r: Reservation) => void;
    selectedReservationId?: string | null;
  }) => (
    <div
      data-testid="tapechart-stub"
      data-rooms={rooms.length}
      data-reservations={reservations.length}
      data-selected={selectedReservationId ?? ""}
    >
      {reservations.map((r) => (
        <button key={r.id} type="button" onClick={() => onReservationClick?.(r)}>
          {r.blockedReason ?? r.guestName ?? r.id}
        </button>
      ))}
    </div>
  );

  return {
    Select,
    Checkbox,
    TapeChart,
    Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Stack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
    Divider: () => <hr />,
    Button: ({ children, ...rest }: { children?: ReactNode; [k: string]: unknown }) => (
      <button {...rest}>{children}</button>
    ),
  };
});

function renderPage() {
  return render(<AvailabilityHeatmapExamplePage />);
}

// ---------------------------------------------------------------------------
// Pure logic — no components involved
// ---------------------------------------------------------------------------

describe("AvailabilityHeatmapExamplePage — pure helpers", () => {
  it("provides a fixed room fixture spanning the demo date range", () => {
    expect(ROOMS.length).toBeGreaterThan(1);
    expect(new Set(ROOMS.map((r) => r.id)).size).toBe(ROOMS.length);
    expect(Date.parse(END_DATE)).toBeGreaterThan(Date.parse(START_DATE));
  });

  it("buildMaintenanceBlocks returns reservations carrying a blockedReason", () => {
    const blocks = buildMaintenanceBlocks(ROOMS);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => Boolean(b.blockedReason))).toBe(true);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });

  it("occupancyRatePercent rises as booking density rises", () => {
    const low = makeReservations(ROOMS, START_DATE, END_DATE, OCCUPANCY_DENSITY.low);
    const high = makeReservations(ROOMS, START_DATE, END_DATE, OCCUPANCY_DENSITY.high);
    const lowRate = occupancyRatePercent(ROOMS, low, START_DATE, END_DATE);
    const highRate = occupancyRatePercent(ROOMS, high, START_DATE, END_DATE);
    expect(lowRate).toBeGreaterThanOrEqual(0);
    expect(highRate).toBeLessThanOrEqual(100);
    expect(highRate).toBeGreaterThan(lowRate);
  });

  it("occupancyRatePercent excludes blocked reservations from the booked count", () => {
    const blocks = buildMaintenanceBlocks(ROOMS);
    const withOnlyBlocks = occupancyRatePercent(ROOMS, blocks, START_DATE, END_DATE);
    expect(withOnlyBlocks).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Composition — page wiring through behavioral component stubs
// ---------------------------------------------------------------------------

describe("AvailabilityHeatmapExamplePage — composition", () => {
  it("renders the grid with every room and the medium-density fixture by default", () => {
    renderPage();
    const chart = screen.getByTestId("tapechart-stub");
    expect(chart).toHaveAttribute("data-rooms", String(ROOMS.length));
    const mediumCount = makeReservations(
      ROOMS,
      START_DATE,
      END_DATE,
      OCCUPANCY_DENSITY.medium
    ).length;
    const maintenanceCount = buildMaintenanceBlocks(ROOMS).length;
    expect(chart).toHaveAttribute("data-reservations", String(mediumCount + maintenanceCount));
  });

  it("changing the occupancy level changes the number of booked cells", async () => {
    const user = userEvent.setup();
    renderPage();
    const chart = screen.getByTestId("tapechart-stub");
    const before = Number(chart.getAttribute("data-reservations"));

    await user.selectOptions(screen.getByLabelText(/occupancy level/i), "high");

    const after = Number(chart.getAttribute("data-reservations"));
    expect(after).toBeGreaterThan(before);
  });

  it("unchecking 'show maintenance blocks' removes the blocked cells", async () => {
    const user = userEvent.setup();
    renderPage();
    const chart = screen.getByTestId("tapechart-stub");
    const before = Number(chart.getAttribute("data-reservations"));

    await user.click(screen.getByRole("checkbox", { name: /maintenance/i }));

    const after = Number(chart.getAttribute("data-reservations"));
    expect(after).toBeLessThan(before);
    expect(after).toBe(before - buildMaintenanceBlocks(ROOMS).length);
  });

  it("clicking a blocked cell surfaces its reason in a detail card", async () => {
    const user = userEvent.setup();
    renderPage();
    const block = buildMaintenanceBlocks(ROOMS)[0]!;

    await user.click(
      within(screen.getByTestId("tapechart-stub")).getByRole("button", {
        name: block.blockedReason,
      })
    );

    expect(screen.getByText(`Blocked · ${block.blockedReason}`)).toBeInTheDocument();
  });
});
