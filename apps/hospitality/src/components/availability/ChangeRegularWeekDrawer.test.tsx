import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", () => ({
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));
// The preview has its own tests (ScheduleFlowPreview.test.tsx): here only what it is handed counts.
vi.mock("./AvailabilityGuestPreview.js", () => ({
  AvailabilityGuestPreview: (props: { focusDate: string; dates: readonly string[] }) => (
    <div data-testid="preview" data-focus={props.focusDate} data-dates={props.dates.length} />
  ),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  DatePicker: (props: { label: string; value: string | null; onChange: (v: string) => void }) => (
    <input
      aria-label={props.label}
      value={props.value ?? ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
}));

import { ChangeRegularWeekDrawer } from "./ChangeRegularWeekDrawer.js";
import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToConfig } from "./quick-setup-draft.js";

const stateOf = (config: AvailabilityConfig): AvailabilityConfigState => ({
  config,
  version: 7,
  source: "rows",
});

/** The PRD demo week as stored: lunch Mon–Fri, dinner Tue–Sun (later Fri–Sat), brunch Sat–Sun. */
function demoConfig(): AvailabilityConfig {
  let n = 0;
  return draftToConfig(demoDraft(), () => `demo-${++n}`);
}

function renderDrawer(config = demoConfig()) {
  const onClose = vi.fn();
  render(
    <main>
      <ChangeRegularWeekDrawer
        venueId="venue-1"
        state={stateOf(config)}
        today="2026-10-25"
        onStale={vi.fn()}
        onClose={onClose}
      />
    </main>
  );
  return { onClose };
}

const chooseStart = (date: string) =>
  fireEvent.change(screen.getByLabelText("Starting"), { target: { value: date } });
const saveButton = () => screen.getByRole("button", { name: /^Save/ });

describe("ChangeRegularWeekDrawer on a varied week", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("pre-fills each service's base hours as the hours most of its days share", () => {
    renderDrawer();
    const closes = screen.getAllByLabelText("Closes");
    // Lunch, Dinner's base, Dinner's Fri–Sat block, Brunch.
    expect(closes.map((c) => (c as HTMLInputElement).value)).toEqual([
      "3:00 PM",
      "11:00 PM",
      "12:00 AM",
      "2:00 PM",
    ]);
    const block = screen.getByRole("group", { name: "Dinner: different hours" });
    const ticked = within(block)
      .getAllByRole("checkbox")
      .filter((c) => (c as HTMLInputElement).checked)
      .map((c) => c.closest("label")?.textContent);
    expect(ticked).toEqual(["Fri", "Sat"]);
  });

  it("needs only a start date to save with no end, and asks for no name", async () => {
    renderDrawer();
    expect(screen.queryByLabelText(/Schedule name/)).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Choose a start date to save.")).toBeInTheDocument();
    chooseStart("2026-11-06");
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { schedules } = save.mock.calls[0]![0].body.changes.upsert;
    expect(schedules.map((s: { name: string; kind: string }) => [s.name, s.kind])).toEqual([
      ["Regular week", "regular"],
      ["Regular week", "regular"],
    ]);
  });

  it("Start tomorrow picks the day after today and saves from it", async () => {
    renderDrawer();
    const tomorrow = screen.getByRole("button", { name: "Start tomorrow" });
    expect(tomorrow).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(tomorrow);
    expect(tomorrow).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Start today" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    fireEvent.click(screen.getByRole("button", { name: "Save hours from Oct 26" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { assignments } = save.mock.calls[0]![0].body.changes.upsert;
    expect(assignments.map((a: { startsOn: string | null }) => a.startsOn)).toContain("2026-10-26");
  });

  it("a period still needs a name, in the period's words", () => {
    renderDrawer();
    chooseStart("2026-11-06");
    fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-11-30" } });
    expect(screen.getByLabelText(/Schedule name/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Name this period to save.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Schedule name/), { target: { value: "Holiday" } });
    expect(saveButton()).toBeEnabled();
  });

  it("the Applies to line and the impact count follow the days the services run", () => {
    renderDrawer();
    chooseStart("2026-11-02");
    expect(screen.getByText("This becomes your regular week: open every day.")).toBeInTheDocument();
    expect(screen.getByText("Applies to 366 future dates")).toBeInTheDocument();

    // Lunch stops running on Monday: nothing runs that day any more.
    const lunchDays = screen.getByRole("group", { name: "Lunch runs on" });
    fireEvent.click(within(lunchDays).getByRole("checkbox", { name: "Monday" }));
    expect(screen.getByText("This becomes your regular week: open Tue–Sun.")).toBeInTheDocument();
    expect(screen.getByText("Monday is closed.")).toBeInTheDocument();
    // 366 dates from a Monday hold 53 Mondays.
    expect(screen.getByText("Applies to 313 future dates")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ending"), { target: { value: "2026-12-31" } });
    expect(
      screen.getByText("Applies to Tue–Sun. Other days keep their hours.")
    ).toBeInTheDocument();
  });

  it("the preview is focused on the first date of the weekday being edited", () => {
    renderDrawer();
    chooseStart("2026-11-02");
    // Nothing touched yet: the first date.
    expect(screen.getByTestId("preview")).toHaveAttribute("data-focus", "2026-11-02");
    // Take Friday out of Dinner's later hours.
    const block = screen.getByRole("group", { name: "Dinner: different hours" });
    fireEvent.click(within(block).getByRole("checkbox", { name: "Fri" }));
    expect(screen.getByTestId("preview")).toHaveAttribute("data-focus", "2026-11-06");
  });
});
