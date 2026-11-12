import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { act, render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const save = vi.hoisted(() => vi.fn());
const reopen = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useFloorPlans.js", () => ({
  useVenueFloorPlanSections: () => ({
    data: [{ id: "sec-bar", name: "Bar" }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("../../hooks/useTables.js", () => ({ useTables: () => ({ data: [] }) }));
vi.mock("../../hooks/useAvailability.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
vi.mock("../../hooks/useClosures.js", () => ({
  useClosureSummaries: () => ({ data: [], error: null, isLoading: false, refetch: vi.fn() }),
  useReopenClosure: () => ({ mutateAsync: reopen, isPending: false }),
  usePreviewClosureImpact: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureImpact: () => ({
    data: { reservations: 0, covers: 0, depositsHeld: 0, groups: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useClosureImpacts: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }),
  useCreateClosures: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({ useRefreshAvailability: () => vi.fn() }));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AvailabilityDayDrawer } from "./AvailabilityDayDrawer.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  PARTY_CLOSURE,
  VENUE_CLOSURE,
  WEEKLY_CLOSURE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

/** Every Friday from the fixture date on: special hours that cover many dates. */
const FRIDAY_HOURS: DateRule = {
  ...EARLY_DINNER,
  id: "r-fridays",
  startsOn: FIXTURE_DATE,
  endsOn: "2026-12-25",
  repeat: { version: 1, weekdays: [5] },
};

/** "Remove" and "Edit" in Why this day (ux.md F-SER, #7981). */
describe("AvailabilityDayDrawer: Remove and Edit in Why this day (#7981)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 8, changeId: "chg-1" });
  });

  function state(rules: DateRule[]): AvailabilityConfigState {
    return { version: 7, source: "rows", config: fixtureConfig(...rules) };
  }

  /** The scope dialog's focus restore runs in a frame; wait past it. */
  const settleFrames = () =>
    act(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
  /** A field inside the open editor (its first service row). */
  const editorInput = () => document.querySelector("fieldset input") as HTMLElement;

  function renderDrawer(
    opts: { role?: "manager" | "host"; rules?: DateRule[]; today?: string } = {}
  ) {
    const rules = opts.rules ?? [EARLY_DINNER];
    const onFinished = vi.fn();
    const onStale = vi.fn();
    const ui = (date: string | null) => (
      <ToastProvider>
        <main>
          <AvailabilityDayDrawer
            date={date}
            day={resolveFixtureDay(...rules)}
            isLoading={false}
            error={null}
            viewerRole={opts.role ?? "manager"}
            onClose={vi.fn()}
            editing={{
              venueId: "venue-1",
              state: state(rules),
              timezone: FIXTURE_TIMEZONE,
              today: opts.today ?? "2026-10-28",
              onDirtyChange: vi.fn(),
              onFinished,
              onStale,
              onCloseDay: vi.fn(),
            }}
          />
        </main>
      </ToastProvider>
    );
    const view = render(ui(FIXTURE_DATE));
    return { onFinished, onStale, setDate: (date: string | null) => view.rerender(ui(date)) };
  }

  it("is a Manager's control: a Host sees the layers and no Remove or Edit", () => {
    renderDrawer({ role: "host" });
    expect(screen.getByText("Special hours")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove special hours/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit hours for/ })).toBeNull();
  });

  it("offers nothing on a date that is over", () => {
    renderDrawer({ today: "2026-11-02" });
    expect(screen.queryByRole("button", { name: /Remove special hours/ })).toBeNull();
  });

  it("makes a past date read-only: its hours show, with no editor, Add service or copy action (#8691)", () => {
    renderDrawer({ today: "2026-11-02" });
    // What the day's hours were stays on screen, as text.
    expect(screen.getAllByText(/^Lunch\b.*\d/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Edit (Lunch|Dinner)/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add (another )?service/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Copy to other days/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Use another day's hours/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Use schedule/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Save \d+ dates?$/ })).toBeNull();
  });

  // The drawer is on FIXTURE_DATE (Fri 2026-10-30): the day before `today` is history; `today`
  // and the days after are not.
  it.each([
    ["the day before today", "2026-10-31", false],
    ["today", "2026-10-30", true],
    ["tomorrow", "2026-10-29", true],
  ])("treats %s as editable=%s (#8691)", (_name, today, editable) => {
    renderDrawer({ today });
    const edit = screen.queryByRole("button", { name: "Edit Lunch" });
    const add = screen.queryByRole("button", { name: /Add service/ });
    const copy = screen.queryByRole("button", { name: /Copy to other days/ });
    expect(edit !== null).toBe(editable);
    expect(add !== null).toBe(editable);
    expect(copy !== null).toBe(editable);
  });

  it("judges a past date on the venue's today, not the UTC date (#8691)", () => {
    // 03:00 UTC on Oct 31 is still Oct 30 in Los Angeles: the drawer's Oct 30 is today there.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-31T03:00:00Z") });
    try {
      renderDrawer({ today: "2026-10-30" });
      expect(screen.getByRole("button", { name: "Edit Lunch" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the special hours after a destructive confirm, and the drawer closes", async () => {
    const { onFinished } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Remove special hours/ }));
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveAccessibleName(/Remove special hours/);
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
    expect(save).toHaveBeenCalledWith({
      venueId: "venue-1",
      body: {
        expectedVersion: 7,
        changes: { upsert: {}, remove: { dateRules: ["r-special"] } },
        scopeConflicts: "keep",
      },
    });
  });

  it("names the whole rule when it repeats, so the confirm never says one date", () => {
    renderDrawer({ rules: [FRIDAY_HOURS] });
    fireEvent.click(screen.getByRole("button", { name: /Remove special hours/ }));
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveAccessibleName(/every Friday/i);
    expect(confirm).toHaveTextContent(/every date/i);
  });

  it("waits for an open editor and says why", () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    const remove = screen.getByRole("button", { name: /Remove special hours/ });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAccessibleDescription(/Save or discard your changes/i);
    fireEvent.click(remove);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("reloads through the page when the removal lost a race, and stays open", async () => {
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
    const { onFinished, onStale } = renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: /Remove special hours/ }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove" })
    );
    await waitFor(() => expect(onStale).toHaveBeenCalledOnce());
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("edits a one-date rule in the drawer's own editor without asking which dates", async () => {
    renderDrawer();
    const edit = screen.getByRole("button", { name: /Edit hours for/ });
    edit.focus();
    fireEvent.click(edit);
    expect(screen.queryByRole("dialog", { name: "Edit special hours" })).toBeNull();
    // The button opens the editor for this date (it used to only move focus to "Edit Lunch").
    expect(await screen.findByRole("button", { name: /^Save 1 date$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Lunch" })).toBeNull();
    await settleFrames();
    expect(editorInput()).toHaveFocus();
  });

  it("asks which dates first when the rule repeats, and then edits them all", async () => {
    renderDrawer({ rules: [FRIDAY_HOURS] });
    fireEvent.click(screen.getByRole("button", { name: /Edit special hours/ }));
    const ask = screen.getByRole("dialog", { name: "Edit special hours" });
    fireEvent.click(within(ask).getByRole("radio", { name: /All dates/i }));
    fireEvent.click(within(ask).getByRole("button", { name: "Continue" }));
    // The editor is open on the chosen scope already.
    expect(screen.getByRole("button", { name: /^Save \d+ dates?$/ })).toBeInTheDocument();
    // The scope dialog hands focus back to its trigger one frame later; the editor must win.
    await settleFrames();
    expect(editorInput()).toHaveFocus();
    // The scope was chosen first, so the editor does not offer its own scope select.
    expect(screen.queryByRole("combobox", { name: /changing/i })).toBeNull();
  });

  it("keeps the editor's own scope select when no scope was chosen first", () => {
    renderDrawer({ rules: [FRIDAY_HOURS] });
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect(screen.getByRole("combobox", { name: /changing/i })).toBeInTheDocument();
  });

  it("does not carry a scope chosen before the drawer was closed into the next edit", () => {
    const { setDate } = renderDrawer({ rules: [FRIDAY_HOURS] });
    fireEvent.click(screen.getByRole("button", { name: /Edit special hours/ }));
    const ask = screen.getByRole("dialog", { name: "Edit special hours" });
    fireEvent.click(within(ask).getByRole("radio", { name: /All dates/i }));
    fireEvent.click(within(ask).getByRole("button", { name: "Continue" }));
    setDate(null);
    setDate(FIXTURE_DATE);
    fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    // The earlier "All dates" is gone: the editor asks for its own scope again.
    expect(screen.getByRole("combobox", { name: /changing/i })).toBeInTheDocument();
  });

  it("will not edit hours that a closure hides, and gives the reason", () => {
    renderDrawer({ rules: [EARLY_DINNER, VENUE_CLOSURE] });
    const edit = screen.getByRole("button", { name: /Edit hours for/ });
    expect(edit).toHaveAttribute("aria-disabled", "true");
    expect(edit).toHaveAccessibleDescription(/closed all day/i);
  });

  it("asks which dates a repeating closure's Edit reaches, opened on this date", () => {
    // The series' next Friday is Oct 23; the drawer is on Oct 30, and the question must be about it.
    renderDrawer({ rules: [WEEKLY_CLOSURE], today: "2026-10-20" });
    fireEvent.click(screen.getByRole("button", { name: /Edit dates of the closure/ }));
    const ask = screen.getByRole("dialog", { name: "Edit dates" });
    expect(within(ask).getByRole("radio", { name: "Only Fri, Oct 30" })).toBeChecked();
  });

  it("reopens a closure from the drawer, and the drawer closes once it is saved", async () => {
    reopen.mockResolvedValue({ version: 8, changeId: "chg-2", notified: 0 });
    const { onFinished } = renderDrawer({ rules: [PARTY_CLOSURE] });
    fireEvent.click(screen.getByRole("button", { name: /Remove closure/ }));
    const ask = screen.getByRole("dialog", { name: /^Reopen/ });
    fireEvent.click(within(ask).getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(onFinished).toHaveBeenCalledWith(true));
    expect(reopen.mock.calls[0]?.[0]).toMatchObject({ venueId: "venue-1", ruleId: "r-party" });
  });

  it("leaves the drawer open when the reopen is cancelled", () => {
    const { onFinished } = renderDrawer({ rules: [PARTY_CLOSURE] });
    fireEvent.click(screen.getByRole("button", { name: /Remove closure/ }));
    fireEvent.click(screen.getByRole("button", { name: "Keep closed" }));
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("offers Remove and Edit, not Edit dates, on a one-date closure", () => {
    renderDrawer({ rules: [VENUE_CLOSURE] });
    expect(screen.getByRole("button", { name: /Remove closure/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit closure for/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit dates/ })).toBeNull();
  });

  it("opens the closure in the Close dialog to edit it (#7984)", () => {
    renderDrawer({ rules: [VENUE_CLOSURE] });
    fireEvent.click(screen.getByRole("button", { name: /Edit closure for/ }));
    const dialog = screen.getByRole("dialog", { name: "Edit closure" });
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("offers no Edit on a closure that ends within the day, which the form cannot say", () => {
    renderDrawer({ rules: [PARTY_CLOSURE] });
    expect(screen.getByRole("button", { name: /Remove closure/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit closure for/ })).toBeNull();
  });

  it("offers no Edit on a repeating closure, which is edited as a series", () => {
    renderDrawer({ rules: [WEEKLY_CLOSURE], today: "2026-10-20" });
    expect(screen.queryByRole("button", { name: /Edit closure for/ })).toBeNull();
  });

  it("offers Close… on an open date that is not over", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "Close…" })).toBeInTheDocument();
  });

  it.each([
    ["already closed all day", { rules: [EARLY_DINNER, VENUE_CLOSURE] }],
    ["over", { today: "2026-11-02" }],
  ])("offers no Close… on a date that is %s", (_, opts) => {
    renderDrawer(opts);
    expect(screen.queryByRole("button", { name: "Close…" })).toBeNull();
  });
});
