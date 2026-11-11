import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { Table } from "@mbe/types";
import {
  emptyDraft,
  replaceBlock,
  replaceService,
  setServiceTime,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";
import { demoDraft, draftService, EVERY_DAY } from "./quick-setup-demo.fixture.js";

type TablesRead = {
  data: Table[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<{ error: Error | null }>;
};
const tables = vi.hoisted(() => ({
  read: {} as unknown,
  calls: [] as unknown[],
  venue: null as { id: string; ianaTimezone: string; currencyCode: string } | null,
}));

vi.mock("../../hooks/useTables.js", () => ({
  useTables: (params: unknown) => {
    tables.calls.push(params);
    return tables.read;
  },
}));
// The venue's zone, so the week is the same on a UTC runner and a Pacific laptop.
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({ selectedVenue: tables.venue }),
}));

import { RegularWeekStrip } from "./RegularWeekStrip.js";

// jsdom has no scrollIntoView; the open Select listbox scrolls to its active option.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function read(over: Partial<TablesRead> = {}): TablesRead {
  return {
    data: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(async () => ({ error: null })),
    ...over,
  };
}

function table(over: Partial<Table> = {}): Table {
  return {
    id: "t1",
    name: "T1",
    tableNumber: "1",
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    location: null,
    isActive: true,
    priority: 1,
    status: "AVAILABLE",
    venueId: "venue-1",
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const row = (day: string) => screen.getByRole("listitem", { name: new RegExp(`^${day}:`) });

/** The demo week with the late close on Fri-Sat moved to 12:45 AM (last seating 12:00 AM). */
function laterFridayAndSaturday(draft: QuickSetupDraft): QuickSetupDraft {
  const dinner = draft.services[1]!;
  const late = dinner.blocks[0]!;
  const moved = setServiceTime(setServiceTime(late, "closes", "00:45"), "lastSeating", "00:00");
  return replaceService(draft, replaceBlock(dinner, moved));
}

describe("RegularWeekStrip", () => {
  beforeEach(() => {
    tables.read = read();
    tables.calls = [];
    tables.venue = { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" };
  });

  it("lists the seven weekdays Monday first with each service's first and last time", () => {
    render(<RegularWeekStrip draft={demoDraft()} />);
    expect(screen.getByRole("heading", { name: "Guest preview" })).toBeInTheDocument();
    const names = screen
      .getAllByRole("listitem")
      .map((li) => li.getAttribute("aria-label")?.split(":")[0]);
    expect(names).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(row("Thursday")).toHaveTextContent("Dinner 5:00 PM – 9:00 PM");
    expect(row("Friday")).toHaveTextContent("Dinner 5:00 PM – 10:00 PM");
    expect(row("Saturday")).toHaveTextContent("Brunch 10:00 AM – 1:00 PM");
  });

  it("shows no dinner on Monday for the demo week", () => {
    render(<RegularWeekStrip draft={demoDraft()} />);
    const monday = row("Monday");
    expect(monday).toHaveTextContent("Lunch 11:30 AM – 2:00 PM");
    expect(monday).not.toHaveTextContent(/Dinner \d/);
    expect(monday).toHaveTextContent("Not offered: Dinner, Brunch");
  });

  it("names the selected venue on the tables read: the server answers a venue-less read 403", () => {
    render(<RegularWeekStrip draft={demoDraft()} />);
    expect(tables.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ venueId: "venue-1", activeOnly: true, enabled: true }),
      ])
    );
  });

  it("does not read tables while no venue is selected", () => {
    tables.venue = null;
    render(<RegularWeekStrip draft={demoDraft()} />);
    expect(tables.calls).toEqual([expect.objectContaining({ enabled: false })]);
    expect(screen.getByText("Monday")).toBeInTheDocument();
  });

  it("moves Friday's last time as the close is edited, with no request but the tables read", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { rerender } = render(<RegularWeekStrip draft={demoDraft()} />);
    expect(row("Friday")).toHaveTextContent("Dinner 5:00 PM – 10:00 PM");
    expect(screen.queryByText("Updated")).not.toBeInTheDocument();

    rerender(<RegularWeekStrip draft={laterFridayAndSaturday(demoDraft())} />);
    expect(row("Friday")).toHaveTextContent("Dinner 5:00 PM – 12:00 AM (next day)");
    expect(row("Saturday")).toHaveTextContent("12:00 AM (next day)");
    // Only the days whose lines moved carry the tag, and the live region says which.
    expect(within(row("Friday")).getByText("Updated")).toBeInTheDocument();
    expect(within(row("Saturday")).getByText("Updated")).toBeInTheDocument();
    expect(within(row("Thursday")).queryByText("Updated")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Friday, Saturday updated");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(tables.calls).toEqual(
      expect.arrayContaining([expect.objectContaining({ activeOnly: true })])
    );
    fetchSpy.mockRestore();
  });

  it("keeps rows as text: no control is added to the card", () => {
    render(<RegularWeekStrip draft={demoDraft()} />);
    const list = screen.getByRole("list");
    expect(within(list).queryAllByRole("button")).toEqual([]);
    expect(within(list).queryAllByRole("link")).toEqual([]);
  });

  it("shows the spans without the party check, under a note, while the tables load", () => {
    tables.read = read({ data: undefined, isLoading: true });
    render(<RegularWeekStrip draft={demoDraft()} />);
    expect(row("Friday")).toHaveTextContent("Dinner 5:00 PM – 10:00 PM");
    expect(screen.getByText("Checking your tables…")).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the typed hours when the tables read fails, with Check again", () => {
    const failed = read({ data: undefined, error: new Error("boom") });
    tables.read = failed;
    render(<RegularWeekStrip draft={demoDraft()} />);
    expect(row("Friday")).toHaveTextContent("Dinner 5:00 PM – 10:00 PM");
    expect(
      screen.getByText("These are the hours you typed, not checked against your tables")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(failed.refetch).toHaveBeenCalledTimes(1);
  });

  it("says a service runs but no table fits the party", () => {
    tables.read = read({ data: [table({ capacity: 4, maxCovers: 4 })] });
    render(<RegularWeekStrip draft={demoDraft()} />);
    expect(row("Friday")).not.toHaveTextContent("no table fits");
    fireEvent.click(screen.getByLabelText("Party"));
    fireEvent.click(screen.getByRole("option", { name: "8" }));
    expect(row("Friday")).toHaveTextContent("Runs, but no table fits a party of 8.");
    expect(row("Friday")).toHaveTextContent("Dinner");
  });

  it("asks for a service, then for days, and says what is left out", () => {
    const { rerender } = render(<RegularWeekStrip draft={emptyDraft("a")} />);
    expect(
      screen.getByText(
        "Add a service with its times and days to see what guests can book each day."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();

    const noDays: QuickSetupDraft = {
      days: [],
      services: [draftService("a", "Dinner", ["17:00", "21:00", "22:00"])],
    };
    rerender(<RegularWeekStrip draft={noDays} />);
    expect(screen.getByText("Choose days to see your week.")).toBeInTheDocument();

    const mixed: QuickSetupDraft = {
      days: EVERY_DAY,
      services: [
        draftService("a", "Dinner", ["17:00", "21:00", "22:00"]),
        draftService("b", "Brunch", ["10:00", "13:00", "14:00"], { days: [] }),
        { ...draftService("c", "Late", ["22:00", "23:00", "01:00"]), closes: null },
      ],
    };
    rerender(<RegularWeekStrip draft={mixed} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getByText("Brunch isn't shown yet: choose its days.")).toBeInTheDocument();
    expect(screen.getByText("Late isn't shown yet: choose a time.")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <main>
        <RegularWeekStrip draft={demoDraft()} />
      </main>
    );
    const options = { rules: { "color-contrast": { enabled: false } } };
    expect((await axe(container, options)).violations).toEqual([]);
  });
});
