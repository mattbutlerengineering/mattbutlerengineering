import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AvailabilityConfig, AvailabilityConfigState } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";

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
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));
import type * as Rialto from "@mattbutlerengineering/rialto";
vi.mock("@mattbutlerengineering/rialto", async (importOriginal) => ({
  ...(await importOriginal<typeof Rialto>()),
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
}));

import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToConfig, type ServiceDraft } from "./quick-setup-draft.js";
import { RegularWeekPanel } from "./RegularWeekPanel.js";

/**
 * What a refused save does to the DATA in the weekly form (availability-hub E4.3). These were
 * written against the inline review panel and pass unchanged against the conflict dialog: only
 * the way to the two answers moved.
 */

const TODAY = "2026-10-25"; // a Sunday

const stateOf = (config: AvailabilityConfig, version: number): AvailabilityConfigState => ({
  config,
  version,
  source: "rows",
});

/** The PRD demo week, with one change per service index laid over it. */
function week(change: (service: ServiceDraft, index: number) => ServiceDraft = (s) => s) {
  let n = 0;
  const saved = demoDraft();
  return draftToConfig({ ...saved, services: saved.services.map(change) }, () => `row-${++n}`);
}

/** A colleague took Monday off Lunch (service 0). */
const lunchWithoutMonday = () => week((s, i) => (i === 0 ? { ...s, days: [2, 3, 4, 5] } : s));
/** Then another took Tuesday off it too. */
const lunchWedToFri = () => week((s, i) => (i === 0 ? { ...s, days: [3, 4, 5] } : s));

const refusal = (currentVersion: number) =>
  new ApiClientError({
    type: "about:blank",
    title: "version-conflict",
    status: 409,
    detail: "Server said no.",
    code: "version-conflict",
    currentVersion,
    winningChange: {
      id: `chg-${currentVersion}`,
      actorId: "auth0|ana",
      at: "2026-10-25T22:42:00.000Z",
      kind: "config",
      summary: "Lunch no longer runs on Monday",
    },
  } as never);

const panel = (state: AvailabilityConfigState, onStale: () => void) => (
  <main>
    <RegularWeekPanel
      venueId="venue-1"
      state={state}
      today={TODAY}
      onStale={onStale}
      onStartLater={vi.fn()}
    />
  </main>
);

const dayOf = (service: string, day: string) => {
  const line = screen.getByRole("button", { name: new RegExp(`^${service}, `) });
  if (line.getAttribute("aria-expanded") === "false") fireEvent.click(line);
  return within(screen.getByRole("group", { name: `${service} runs on` })).getByRole("checkbox", {
    name: day,
  });
};

/** One of the two answers, wherever the form offers it (behind Review their change, or inline). */
async function answer(name: "Reapply my changes" | "Start over") {
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name }) ??
        screen.queryByRole("button", { name: "Review their change" })
    ).not.toBeNull()
  );
  const review = screen.queryByRole("button", { name: "Review their change" });
  if (review) fireEvent.click(review);
  fireEvent.click(screen.getByRole("button", { name }));
}

/** The Manager takes Tuesday off Dinner and saves; the save is refused and the reload lands. */
async function loseTheRace() {
  save.mockRejectedValueOnce(refusal(8));
  const onStale = vi.fn();
  const utils = render(panel(stateOf(week(), 7), onStale));
  fireEvent.click(dayOf("Dinner", "Tuesday"));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1));
  utils.rerender(panel(stateOf(lunchWithoutMonday(), 8), onStale));
  return { ...utils, onStale };
}

describe("RegularWeekPanel after a refused save: what happens to the hours", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 9, changeId: "chg" });
  });

  it("the refused save was checked against the version the form opened on", async () => {
    await loseTheRace();
    expect(save.mock.calls[0]![0].body.expectedVersion).toBe(7);
  });

  it("Reapply puts the Manager's edited service over the colleague's version and keeps the colleague's other change", async () => {
    await loseTheRace();
    await answer("Reapply my changes");
    // Mine: Dinner no longer runs on Tuesday. Theirs: Lunch no longer runs on Monday.
    expect(dayOf("Dinner", "Tuesday")).not.toBeChecked();
    expect(dayOf("Dinner", "Wednesday")).toBeChecked();
    expect(dayOf("Lunch", "Monday")).not.toBeChecked();
    expect(dayOf("Lunch", "Tuesday")).toBeChecked();
    // Still an unsaved edit: the Manager checks the result, then saves.
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("the save that follows a Reapply is checked against the latest version", async () => {
    await loseTheRace();
    await answer("Reapply my changes");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].body.expectedVersion).toBe(8);
  });

  it("Start over shows the colleague's version with none of the Manager's edits, and a clean form", async () => {
    await loseTheRace();
    await answer("Start over");
    // Each line is the stored week's: Dinner has its Tuesday back, Lunch has lost its Monday.
    expect(
      screen.getByRole("button", { name: /^Dinner, 5:00 PM–11:00 PM · Tue–Sun/ })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Lunch, 11:30 AM–3:00 PM · Tue–Fri/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("a second refusal after a Reapply is answered the same way, against the newer version", async () => {
    const { rerender, onStale } = await loseTheRace();
    await answer("Reapply my changes");
    save.mockRejectedValueOnce(refusal(9));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onStale).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].body.expectedVersion).toBe(8);
    rerender(panel(stateOf(lunchWedToFri(), 9), onStale));

    await answer("Reapply my changes");
    expect(dayOf("Dinner", "Tuesday")).not.toBeChecked();
    expect(dayOf("Lunch", "Monday")).not.toBeChecked();
    expect(dayOf("Lunch", "Tuesday")).not.toBeChecked();
    expect(dayOf("Lunch", "Wednesday")).toBeChecked();

    save.mockResolvedValueOnce({ version: 10, changeId: "chg-10" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    expect(save.mock.calls[2]![0].body.expectedVersion).toBe(9);
  });
});
