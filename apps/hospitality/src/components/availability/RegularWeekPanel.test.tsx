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
// The draft preview has its own tests (ScheduleFlowPreview.test.tsx): here it never answers.
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
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

function panel(
  state: AvailabilityConfigState,
  extra: {
    onStartLater?: () => void;
    onStale?: () => void;
    resetAtVersion?: number;
    refreshError?: string | null;
  } = {}
) {
  return (
    <main>
      <RegularWeekPanel
        venueId="venue-1"
        state={state}
        today={TODAY}
        onStale={extra.onStale ?? vi.fn()}
        onStartLater={extra.onStartLater ?? vi.fn()}
        resetAtVersion={extra.resetAtVersion}
        refreshError={extra.refreshError}
      />
    </main>
  );
}

const dinnerTuesday = () =>
  within(screen.getByRole("group", { name: "Dinner runs on" })).getByRole("checkbox", {
    name: "Tuesday",
  });

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

  it("pins the footer while the form is dirty, and only then", () => {
    const { container } = render(panel(stateOf(demoConfig())));
    expect(container.querySelector("[data-pinned]")).toBeNull();
    fireEvent.click(lunchMonday());
    const pinned = container.querySelector("[data-pinned]");
    expect(pinned).not.toBeNull();
    expect(within(pinned as HTMLElement).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("an edit adds Discard, Save and the drawer's captions", () => {
    render(panel(stateOf(demoConfig())));
    fireEvent.click(lunchMonday());
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByText("This becomes your regular week: open Tue–Sun.")).toBeInTheDocument();
    expect(screen.getByText("Monday is closed.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What changes for guests" })).toBeInTheDocument();
  });

  it("a dirty panel has one Guest preview (the form's) and one What changes for guests", () => {
    render(panel(stateOf(demoConfig())));
    fireEvent.click(lunchMonday());
    expect(screen.getAllByRole("heading", { name: "Guest preview" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { name: "What changes for guests" })).toHaveLength(1);
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

  describe("when the saved week moves under the form", () => {
    /** The demo week with Lunch no longer running on Mondays, as another save would leave it. */
    function lunchWithoutMonday(): AvailabilityConfig {
      let n = 0;
      const saved = demoDraft();
      return draftToConfig(
        {
          ...saved,
          services: saved.services.map((s, i) => (i === 0 ? { ...s, days: [2, 3, 4, 5] } : s)),
        },
        () => `other-${++n}`
      );
    }
    const discard = () => screen.queryByRole("button", { name: "Discard" });

    it("shows the new week when a version lands while the form is clean (Undo, a colleague, Compare, Add, Delete)", () => {
      const { rerender } = render(panel(stateOf(demoConfig())));
      expect(lunchMonday()).toBeChecked();
      rerender(panel(stateOf(lunchWithoutMonday(), 9)));
      expect(lunchMonday()).not.toBeChecked();
    });

    it("does not replace the form's edits, and offers no Save of its own, while it is dirty", () => {
      const { rerender } = render(panel(stateOf(demoConfig())));
      fireEvent.click(
        within(screen.getByRole("group", { name: "Dinner runs on" })).getByRole("checkbox", {
          name: "Tuesday",
        })
      );
      rerender(panel(stateOf(lunchWithoutMonday(), 9)));
      expect(discard()).toBeInTheDocument();
      // Still the Manager's week, not the colleague's.
      expect(lunchMonday()).toBeChecked();
    });

    it("starts again from the saved week once a save the page made (Starting later…) has landed, edits or not", () => {
      const { rerender } = render(panel(stateOf(demoConfig())));
      fireEvent.click(lunchMonday());
      expect(discard()).toBeInTheDocument();
      // Not landed yet: the edits stay.
      rerender(panel(stateOf(demoConfig(), 7), { resetAtVersion: 8 }));
      expect(discard()).toBeInTheDocument();
      rerender(panel(stateOf(lunchWithoutMonday(), 8), { resetAtVersion: 8 }));
      expect(discard()).not.toBeInTheDocument();
      expect(lunchMonday()).not.toBeChecked();
    });

    it("goes through conflict review, not a silent re-seed, when a colleague saved first", async () => {
      const config = demoConfig();
      save.mockRejectedValueOnce(
        Object.assign(new Error("conflict"), {
          problemDetails: {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "x",
            code: "version-conflict",
          },
        })
      );
      const onStale = vi.fn();
      const { rerender } = render(panel(stateOf(config), { onStale }));
      fireEvent.click(dinnerTuesday());
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
      rerender(panel(stateOf(lunchWithoutMonday(), 8), { onStale }));
      fireEvent.click(await screen.findByRole("button", { name: "Reapply my changes" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
      expect(save.mock.calls[1]![0].body.expectedVersion).toBe(8);
    });

    it("Start over takes the colleague's week", async () => {
      save.mockRejectedValueOnce(
        Object.assign(new Error("conflict"), {
          problemDetails: {
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "x",
            code: "version-conflict",
          },
        })
      );
      const onStale = vi.fn();
      const { rerender } = render(panel(stateOf(demoConfig()), { onStale }));
      fireEvent.click(dinnerTuesday());
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
      rerender(panel(stateOf(lunchWithoutMonday(), 8), { onStale }));
      fireEvent.click(await screen.findByRole("button", { name: "Start over" }));
      expect(lunchMonday()).not.toBeChecked();
      expect(discard()).not.toBeInTheDocument();
    });

    it("stops waiting for a refresh that failed, shows why and lets the Manager save again", async () => {
      const config = demoConfig();
      const { rerender } = render(panel(stateOf(config)));
      fireEvent.click(lunchMonday());
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
      rerender(panel(stateOf(config, 7), { refreshError: "Network down" }));
      expect(screen.getByRole("alert")).toHaveTextContent("Network down");
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
  });
});
