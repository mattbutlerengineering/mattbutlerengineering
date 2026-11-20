import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";

const save = vi.hoisted(() => vi.fn());
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../hooks/useAvailability.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSaveAvailabilityConfig: () => ({ mutateAsync: save, isPending: false }),
  useRevertAvailabilityChange: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("./AvailabilityGuestPreview.js", () => ({ AvailabilityGuestPreview: () => null }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { AvailabilityDayEditor } from "./AvailabilityDayEditor.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

/**
 * PRD 10 (availability-hub D5.1, carried from E4.3): the date editor's Review offers Reapply my
 * changes and Start over, as the weekly forms' does, and the dialog says who saved.
 */

const winningChange = {
  id: "chg-9",
  actorId: "auth0|ana",
  at: "2026-10-25T22:42:00.000Z",
  kind: "config",
  summary: "Dinner closes at 10:00 PM on Fri, Oct 30",
};

const refusal = (extra: Record<string, unknown> = {}) =>
  new ApiClientError({
    type: "about:blank",
    title: "version-conflict",
    status: 409,
    detail: "Server said no.",
    code: "version-conflict",
    currentVersion: 5,
    winningChange,
    ...extra,
  } as never);

const editor = (version: number, rules: DateRule[]) => {
  const state: AvailabilityConfigState = {
    config: fixtureConfig(...rules),
    version,
    source: "rows",
  };
  return (
    <ToastProvider>
      <main>
        <AvailabilityDayEditor
          venueId="venue-1"
          date={FIXTURE_DATE}
          day={resolveFixtureDay(...rules)}
          state={state}
          timezone={FIXTURE_TIMEZONE}
          today="2026-10-28"
          onDirtyChange={onDirtyChange}
          onCancel={vi.fn()}
          onFinished={onFinished}
          onStale={vi.fn()}
        />
      </main>
    </ToastProvider>
  );
};
const onFinished = vi.fn();
const onDirtyChange = vi.fn();

/** The Manager removes Lunch and loses the race; the reload then arrives with the colleague's rule. */
async function lostRace(arrived: boolean) {
  save.mockRejectedValueOnce(refusal());
  const view = render(editor(4, []));
  fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
  fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));
  const dialog = await screen.findByRole("dialog", { name: "Someone changed availability first" });
  if (arrived) view.rerender(editor(5, [EARLY_DINNER]));
  fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
  return { ...view, dialog };
}

describe("the date editor's conflict dialog", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 6, changeId: "chg-1" });
  });

  it("names who saved the winning change", async () => {
    const { dialog } = await lostRace(true);
    expect(within(dialog).getAllByText(/saved by a teammate at/).length).toBeGreaterThan(0);
  });

  it("waits for the latest version before Reapply, and says so", async () => {
    const { dialog } = await lostRace(false);
    expect(within(dialog).getByText("Loading the latest version…")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Reapply my changes" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Start over" })).toBeEnabled();
  });

  it("lists what the winning version changed in the hours", async () => {
    const { dialog } = await lostRace(true);
    expect(within(dialog).getByText("Hours changed: Dinner")).toBeTruthy();
  });

  it("Reapply my changes keeps the colleague's hours with the Manager's removal on top", async () => {
    const { dialog } = await lostRace(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Reapply my changes" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Lunch" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Dinner" })).toBeTruthy();
    expect(onFinished).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    // The next save is checked against the version the Manager has now seen.
    expect(save.mock.calls[1]?.[0].body.expectedVersion).toBe(5);
  });

  it("Start over drops the draft and shows the winning version, ready to edit again", async () => {
    const { dialog } = await lostRace(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Start over" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Lunch" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save 1 date" })).toBeDisabled();
    expect(onFinished).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
