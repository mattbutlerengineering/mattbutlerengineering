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
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
// The preview has its own tests (ScheduleFlowPreview.test.tsx): here only that it shows counts.
vi.mock("./AvailabilityGuestPreview.js", () => ({
  AvailabilityGuestPreview: () => <div data-testid="stranded-preview" />,
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
}));

import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToConfig } from "./quick-setup-draft.js";
import { EARLY_DINNER } from "./resolved-day-fixtures.js";
import { RegularWeekPanel } from "./RegularWeekPanel.js";

const stateOf = (config: AvailabilityConfig, version = 7): AvailabilityConfigState => ({
  config,
  version,
  source: "rows",
});

/** The PRD demo week as stored: lunch Mon–Fri, dinner Tue–Sun (later Fri–Sat), brunch Sat–Sun. */
function demoConfig(): AvailabilityConfig {
  let n = 0;
  return draftToConfig(demoDraft(), () => `demo-${++n}`);
}

const TODAY = "2026-10-25"; // a Sunday

function panel(state: AvailabilityConfigState, extra: { onStartLater?: () => void } = {}) {
  return (
    <main>
      <RegularWeekPanel
        venueId="venue-1"
        state={state}
        today={TODAY}
        onStale={vi.fn()}
        onStartLater={extra.onStartLater ?? vi.fn()}
      />
    </main>
  );
}

const lunchMonday = () =>
  within(screen.getByRole("group", { name: "Lunch runs on" })).getByRole("checkbox", {
    name: "Monday",
  });

describe("RegularWeekPanel", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg" });
  });

  it("shows the saved services, times, days and the guest preview", () => {
    render(panel(stateOf(demoConfig())));
    expect(screen.getAllByLabelText("Closes").map((c) => (c as HTMLInputElement).value)).toEqual([
      "3:00 PM",
      "11:00 PM",
      "12:00 AM",
      "2:00 PM",
    ]);
    expect(lunchMonday()).toBeChecked();
    expect(screen.getByText("Guest preview")).toBeInTheDocument();
  });

  it("says when changes apply and offers Starting later… before any edit", () => {
    render(panel(stateOf(demoConfig())));
    expect(screen.getByText("Changes apply from today, Sun, Oct 25.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Starting later…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(screen.queryByText(/This becomes your regular week/)).not.toBeInTheDocument();
  });

  it("an edit adds Discard, Save and the drawer's captions", () => {
    render(panel(stateOf(demoConfig())));
    fireEvent.click(lunchMonday());
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByText("This becomes your regular week: open Tue–Sun.")).toBeInTheDocument();
    expect(screen.getByText("Monday is closed.")).toBeInTheDocument();
    expect(screen.getByTestId("stranded-preview")).toBeInTheDocument();
  });

  it("Discard returns the form to the saved week", () => {
    render(panel(stateOf(demoConfig())));
    fireEvent.click(lunchMonday());
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(lunchMonday()).toBeChecked();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("Save sends the drawer's change from today with no end, then re-seeds from the refreshed config", async () => {
    const config = demoConfig();
    const { rerender } = render(panel(stateOf(config)));
    fireEvent.click(lunchMonday());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const { body } = save.mock.calls[0]![0];
    expect(body.expectedVersion).toBe(7);
    expect(
      body.changes.upsert.assignments.map((a: { startsOn: string | null }) => a.startsOn)
    ).toContain(TODAY);
    expect(body.changes.upsert.schedules.map((s: { kind: string }) => s.kind)).toEqual([
      "regular",
      "regular",
    ]);

    // Until the refreshed config arrives the form does not offer a second save.
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();

    // The refreshed config reached the saved version: the form is built from it, not dirty.
    let n = 0;
    const saved = demoDraft();
    const refreshed = draftToConfig(
      {
        ...saved,
        services: saved.services.map((s, i) => (i === 0 ? { ...s, days: [2, 3, 4, 5] } : s)),
      },
      () => `saved-${++n}`
    );
    rerender(panel(stateOf(refreshed, 8)));
    expect(lunchMonday()).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Starting later…" })).toBeInTheDocument();
  });

  it("Starting later… hands over the current draft", () => {
    const onStartLater = vi.fn();
    render(panel(stateOf(demoConfig()), { onStartLater }));
    fireEvent.click(lunchMonday());
    fireEvent.click(screen.getByRole("button", { name: "Starting later…" }));
    expect(onStartLater).toHaveBeenCalledTimes(1);
    const draft = onStartLater.mock.calls[0]![0];
    expect(draft.services[0].days).not.toContain(1);
  });

  it("shows the own-changes choice when covered dates have their own special hours", () => {
    const config = { ...demoConfig(), dateRules: [EARLY_DINNER] };
    render(panel(stateOf(config)));
    expect(screen.queryByText(/already have their own changes/)).not.toBeInTheDocument();
    fireEvent.click(lunchMonday());
    expect(screen.getByRole("radio", { name: "Keep theirs" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Replace them" })).toBeInTheDocument();
  });
});
