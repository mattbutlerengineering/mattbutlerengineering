import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimelineGrid } from "./TimelineGrid.js";
import { makeReservation, makeTable } from "./readOnly.fixtures";

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

const tables = [makeTable()];
const reservations = [makeReservation()];

describe("TimelineGrid default render is unchanged by readOnly and now support", () => {
  it("renders the same DOM when neither prop is set", () => {
    const { container } = render(
      <TimelineGrid
        tables={tables}
        reservations={reservations}
        date="2020-01-01"
        startHour={17}
        endHour={19}
      />
    );
    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<div class="gridFrame"><div data-testid="timeline-grid" class="gridWrapper " role="grid" aria-label="Reservation timeline" tabindex="0"><div style="width: 480px; height: 100px;"><div class="headerRow" role="row" style="height: 40px;"><div class="tableColumnHeader" role="columnheader" style="width: 120px; min-width: 120px;">Tables</div><div class="hourHeader" role="columnheader" style="width: 120px; min-width: 120px;">5 PM</div><div class="hourHeader" role="columnheader" style="width: 120px; min-width: 120px;">6 PM</div><div class="hourHeader" role="columnheader" style="width: 120px; min-width: 120px;">7 PM</div></div><div data-testid="table-row-table-1" class="tableRow" role="row" aria-label="Table Table 1" style="height: 60px;"><div class="tableNameCell" role="rowheader" style="width: 120px; min-width: 120px;"><div class="tableMeta"><div class="tableNameLine"><div class="tableName">T1</div><div class="tableCapacity" data-truncate="true" title="2-4 guests">2-4 guests</div></div><div class="_wrapper_1kow9_2"><div role="presentation"><button type="button" class="_button_15hse_1 _focusRing_ik4wr_70 _ghost_15hse_84 _sm_15hse_165 trigger " aria-label="Table 1: Available. Change status" data-testid="table-status-table-1" id="_r_1_" aria-haspopup="menu" aria-expanded="false" tabindex="0"><span><span class="_led_v5do8_1 _xs_v5do8_22 _success_v5do8_44" role="presentation" aria-hidden="true"></span><span class="_text_1lz8n_6 _label_1lz8n_37">Available</span><span class="_text_1lz8n_6 _caption_1lz8n_21 chevron" aria-hidden="true">▾</span></span></button></div></div></div></div><div class="reservationArea" role="gridcell"><div class="hourGrid"><div data-testid="grid-cell-0-0" class="hourGridLine hourGridLineActive" style="width: 120px;"></div><div data-testid="grid-cell-0-1" class="hourGridLine " style="width: 120px;"></div><div data-testid="grid-cell-0-2" class="hourGridLine " style="width: 120px;"></div></div><button type="button" data-testid="reservation-block-res-1" class="block statusConfirmed  " style="left: -720px; width: 236px;" title="Jane Doe - 4 guests at 11:00 AM" aria-label="Jane Doe, party of 4, 11:00 AM, confirmed" aria-pressed="false"><div class="content"><div class="guestName" data-truncate="true"><span>Jane Doe</span></div><div class="details" data-truncate="true">4 · 11:00 AM</div></div></button></div></div></div></div></div>"`
    );
  });
});

describe("TimelineGrid readOnly", () => {
  const handlers = () => ({
    onReservationClick: vi.fn(),
    onTableStatusChange: vi.fn(),
  });

  it("renders blocks as non-buttons and no table status menu", () => {
    const h = handlers();
    render(
      <TimelineGrid tables={tables} reservations={reservations} date="2020-01-01" readOnly {...h} />
    );
    expect(screen.getByTestId("reservation-block-res-1").tagName).toBe("DIV");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("calls no handler on a block click, an Enter on a cell, or a key navigation", () => {
    const h = handlers();
    render(
      <TimelineGrid tables={tables} reservations={reservations} date="2020-01-01" readOnly {...h} />
    );
    fireEvent.click(screen.getByTestId("reservation-block-res-1"));
    const grid = screen.getByRole("grid");
    grid.focus();
    for (const key of ["ArrowRight", "ArrowDown", "Enter", " ", "Home"]) {
      fireEvent.keyDown(grid, { key });
    }
    fireEvent.keyDown(screen.getByTestId("grid-cell-0-0"), { key: "Enter" });
    expect(h.onReservationClick).not.toHaveBeenCalled();
    expect(h.onTableStatusChange).not.toHaveBeenCalled();
  });

  it("starts no drag on a block", () => {
    render(<TimelineGrid tables={tables} reservations={reservations} date="2020-01-01" readOnly />);
    const block = screen.getByTestId("reservation-block-res-1");
    expect(block).not.toHaveAttribute("draggable", "true");
  });
});

describe("TimelineGrid now override", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 9, 0, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("places the now-line at the override instant even when date is not today", () => {
    render(
      <TimelineGrid
        tables={tables}
        reservations={[]}
        date="2020-01-01"
        now={new Date(2026, 4, 14, 20, 0, 0, 0)}
      />
    );
    // tableColumn 120 + (20 - 11) hours * 120
    expect(parseFloat(screen.getByTestId("now-line").style.left)).toBe(1200);
  });

  it("moves the now-line when the override moves", () => {
    const { rerender } = render(
      <TimelineGrid
        tables={tables}
        reservations={[]}
        date="2020-01-01"
        now={new Date(2026, 4, 14, 20, 0, 0, 0)}
      />
    );
    rerender(
      <TimelineGrid
        tables={tables}
        reservations={[]}
        date="2020-01-01"
        now={new Date(2026, 4, 14, 21, 30, 0, 0)}
      />
    );
    expect(parseFloat(screen.getByTestId("now-line").style.left)).toBe(120 + 10.5 * 120);
  });

  it("renders no now-line without the override on another date", () => {
    render(<TimelineGrid tables={tables} reservations={[]} date="2020-01-01" />);
    expect(screen.queryByTestId("now-line")).toBeNull();
  });
});
