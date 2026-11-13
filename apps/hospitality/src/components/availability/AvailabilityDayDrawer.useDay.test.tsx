import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useAvailability.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
// The preview has its own tests (ScheduleFlowPreview.test.tsx); here it never answers.
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], error: null, isLoading: false, refetch: vi.fn() }),
}));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { openCopyFrom } from "../../test/copy-hours.js";
import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  VENUE_CLOSURE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

/** "Use other hours…" in the drawer's actions (ux.md F2, availability-hub ux.md:379). */
describe("AvailabilityDayDrawer: use another day's hours (#7981)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg-1" });
  });

  function state(rules: DateRule[], extraSchedule: boolean): AvailabilityConfigState {
    const base = fixtureConfig(...rules);
    return {
      version: 7,
      source: "rows",
      config: extraSchedule
        ? {
            ...base,
            schedules: [
              ...base.schedules,
              { id: "summer", name: "Summer hours", kind: "alternate", isRegular: false },
            ],
          }
        : base,
    };
  }

  function renderDrawer(
    opts: {
      role?: "manager" | "host";
      rules?: DateRule[];
      extraSchedule?: boolean;
      today?: string;
    } = {}
  ) {
    const rules = opts.rules ?? [];
    const onFinished = vi.fn();
    const onStale = vi.fn();
    render(
      <ToastProvider>
        <main>
          <AvailabilityDayDrawer
            date={FIXTURE_DATE}
            day={resolveFixtureDay(...rules)}
            isLoading={false}
            error={null}
            viewerRole={opts.role ?? "manager"}
            onClose={vi.fn()}
            editing={{
              venueId: "venue-1",
              state: state(rules, opts.extraSchedule ?? false),
              timezone: FIXTURE_TIMEZONE,
              today: opts.today ?? "2026-10-28",
              onDirtyChange: vi.fn(),
              onFinished,
              onStale,
            }}
          />
        </main>
      </ToastProvider>
    );
    return { onFinished, onStale };
  }

  it("is a Manager's action: a Host does not get it", () => {
    renderDrawer({ role: "host" });
    expect(
      screen.queryByRole("button", { name: /Use other hours|Use another day|Use schedule/ })
    ).toBeNull();
  });

  it("waits for an open editor, like Copy, and says why", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    const action = screen.getByRole("button", { name: "Use other hours…" });
    expect(action).toHaveAttribute("aria-disabled", "true");
    expect(action).toHaveAccessibleDescription(/Save or discard your changes/i);
    fireEvent.click(action);
    expect(screen.queryByRole("dialog", { name: /Use another day/ })).toBeNull();
  });

  it("saves the date and tells the page it is done, so the drawer closes", async () => {
    const { onFinished } = renderDrawer({ extraSchedule: true });
    await openCopyFrom(/Use a schedule/);
    fireEvent.click(screen.getByRole("combobox", { name: "Schedule" }));
    fireEvent.click(screen.getByRole("option", { name: "Summer hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1 date" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
  });

  it("reloads the config through the page when the save lost a race", async () => {
    save.mockRejectedValue({
      problemDetails: {
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Changed",
        code: "version-conflict",
        winningChange: null,
      },
    });
    const { onFinished, onStale } = renderDrawer({ extraSchedule: true });
    await openCopyFrom(/Use a schedule/);
    fireEvent.click(screen.getByRole("combobox", { name: "Schedule" }));
    fireEvent.click(screen.getByRole("option", { name: "Summer hours" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply to 1 date" }));
    await waitFor(() => expect(onStale).toHaveBeenCalledOnce());
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("is shut on a date closed all day, and the reason sits beside it", () => {
    renderDrawer({ rules: [VENUE_CLOSURE] });
    const dialog = screen.getByRole("dialog");
    const action = within(dialog).getByRole("button", { name: "Use other hours…" });
    expect(action).toHaveAttribute("aria-disabled", "true");
    expect(action).toHaveAccessibleDescription(/closed all day/i);
    fireEvent.click(action);
    expect(screen.queryByRole("dialog", { name: /Use another day/ })).toBeNull();
  });
});
