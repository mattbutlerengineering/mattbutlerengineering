import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState } from "@mbe/types";
import { ApiClientError } from "@mbe/api-client";

const save = vi.hoisted(() => vi.fn());
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
vi.mock("../../hooks/useTables.js", () => ({
  useTables: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../../hooks/useAvailabilityPreview.js", () => ({
  useAvailabilityPreview: () => ({ result: null, isFetching: false, error: null, retry: () => {} }),
}));

import { AvailabilityDayEditor } from "./AvailabilityDayEditor.js";
import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToConfig } from "./quick-setup-draft.js";
import { RegularWeekPanel } from "./RegularWeekPanel.js";
import {
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

/**
 * PRD criterion 10 (availability-hub E4.3): one refused save, driven through the weekly form and
 * through the date editor, is answered by the same dialog with the same labels.
 */

/** The one server answer both forms get: a colleague's change, saved at 3:42 PM on the venue clock. */
const refusal = () =>
  new ApiClientError({
    type: "about:blank",
    title: "version-conflict",
    status: 409,
    detail: "Server said no.",
    code: "version-conflict",
    currentVersion: 8,
    winningChange: {
      id: "chg-8",
      actorId: "auth0|ana",
      at: "2026-10-25T22:42:00.000Z",
      kind: "config",
      summary: "Lunch no longer runs on Monday",
    },
  } as never);

const TITLE = "Someone changed availability first";
const ANSWERS = ["Review their change", "Back to my draft", "Discard mine", "Overwrite"];

function week(lunchDays?: readonly number[]) {
  let n = 0;
  const saved = demoDraft();
  return draftToConfig(
    {
      ...saved,
      services: saved.services.map((s, i) =>
        i === 0 && lunchDays ? { ...s, days: lunchDays } : s
      ),
    },
    () => `row-${++n}`
  );
}

const weekly = (state: AvailabilityConfigState, onStale: () => void) => (
  <ToastProvider>
    <main>
      <RegularWeekPanel
        venueId="venue-1"
        state={state}
        today="2026-10-25"
        onStale={onStale}
        onStartLater={vi.fn()}
      />
    </main>
  </ToastProvider>
);

/** The weekly form, refused: the Manager took Tuesday off Dinner; the reload has landed. */
async function refuseWeekly() {
  save.mockRejectedValueOnce(refusal());
  const onStale = vi.fn();
  const utils = render(weekly({ config: week(), version: 7, source: "rows" }, onStale));
  fireEvent.click(screen.getByRole("button", { name: /^Dinner, / }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "Dinner runs on" })).getByRole("checkbox", {
      name: "Tuesday",
    })
  );
  const saveButton = screen.getByRole("button", { name: "Save" });
  saveButton.focus();
  fireEvent.click(saveButton);
  const dialog = await screen.findByRole("dialog", { name: TITLE });
  utils.rerender(weekly({ config: week([2, 3, 4, 5]), version: 8, source: "rows" }, onStale));
  return { ...utils, dialog };
}

/** The date editor, refused: the Manager removed Lunch from one date. */
async function refuseDate() {
  save.mockRejectedValueOnce(refusal());
  const utils = render(
    <ToastProvider>
      <main>
        <AvailabilityDayEditor
          venueId="venue-1"
          date={FIXTURE_DATE}
          day={resolveFixtureDay()}
          state={{ config: fixtureConfig(), version: 4, source: "rows" }}
          timezone={FIXTURE_TIMEZONE}
          today="2026-10-28"
          onDirtyChange={vi.fn()}
          onCancel={vi.fn()}
          onFinished={vi.fn()}
          onStale={vi.fn()}
        />
      </main>
    </ToastProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Lunch" }));
  fireEvent.click(screen.getByRole("button", { name: "Save 1 date" }));
  const dialog = await screen.findByRole("dialog", { name: TITLE });
  return { ...utils, dialog };
}

const labels = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("button")
    .map((button) => button.textContent)
    // The dialog's own close control has no text.
    .filter((text) => text !== "");

/** What the dialog says of the refusal before any answer: its title, its sentence, its answers. */
const said = (dialog: HTMLElement) => ({
  title: dialog.getAttribute("aria-label") ?? within(dialog).getByRole("heading").textContent,
  what: within(dialog).getByText(/^Lunch no longer runs on Monday/).textContent,
  answers: labels(dialog),
});

describe("one conflict dialog for the weekly form and the date editor", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    save.mockResolvedValue({ version: 9, changeId: "chg" });
  });

  it("says the same refusal the same way in both: what changed, when, and the same answers", async () => {
    const date = await refuseDate();
    const fromDate = said(date.dialog);
    date.unmount();
    const fromWeekly = said((await refuseWeekly()).dialog);

    expect(fromWeekly).toEqual(fromDate);
    expect(fromWeekly.what).toBe("Lunch no longer runs on Monday (saved at 3:42 PM).");
    expect(fromWeekly.answers).toEqual(ANSWERS);
  });

  it("Review their change shows their change beside the draft in both", async () => {
    for (const refuse of [refuseDate, refuseWeekly]) {
      const { dialog, unmount } = await refuse();
      fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
      expect(within(dialog).getByRole("heading", { name: "Their change" })).toBeTruthy();
      expect(within(dialog).getByRole("heading", { name: "Your draft" })).toBeTruthy();
      unmount();
    }
  });

  it("the weekly form's draft is listed by service, as the date editor's is", async () => {
    const { dialog } = await refuseWeekly();
    fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
    expect(within(dialog).getByText("Lunch 11:30 AM – 3:00 PM")).toBeTruthy();
    expect(within(dialog).getByText("Dinner 5:00 PM – 11:00 PM")).toBeTruthy();
  });

  it("in the weekly form, Review their change offers Reapply my changes and Start over", async () => {
    const { dialog } = await refuseWeekly();
    expect(within(dialog).queryByRole("button", { name: "Reapply my changes" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
    expect(within(dialog).getByRole("button", { name: "Reapply my changes" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Start over" })).toBeEnabled();
  });

  it("holds Reapply until the latest version has loaded", async () => {
    save.mockRejectedValueOnce(refusal());
    render(weekly({ config: week(), version: 7, source: "rows" }, vi.fn()));
    fireEvent.click(screen.getByRole("button", { name: /^Lunch, / }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Lunch runs on" })).getByRole("checkbox", {
        name: "Friday",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog", { name: TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
    expect(within(dialog).getByText("Loading the latest version…")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Reapply my changes" })).toBeDisabled();
    // Not loaded, so Overwrite would go against hours the Manager has not been shown.
    expect(within(dialog).getByRole("button", { name: "Overwrite" })).toBeDisabled();
  });

  it("puts focus inside the dialog when it opens, in both", async () => {
    for (const refuse of [refuseDate, refuseWeekly]) {
      const { dialog, unmount } = await refuse();
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      unmount();
    }
  });

  it("Back to my draft closes the dialog, keeps the edit and returns focus to Save", async () => {
    const { dialog } = await refuseWeekly();
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to my draft" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull());
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();
    await waitFor(() => expect(saveButton).toHaveFocus());
    // The draft is still built on the version it opened on: saving meets the conflict afresh.
    save.mockRejectedValueOnce(refusal());
    fireEvent.click(saveButton);
    expect(await screen.findByRole("dialog", { name: TITLE })).toBeTruthy();
    expect(save.mock.calls[1]![0].body.expectedVersion).toBe(7);
  });

  it("Start over leaves focus on a control that is still there", async () => {
    const { dialog } = await refuseWeekly();
    fireEvent.click(within(dialog).getByRole("button", { name: "Review their change" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull());
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Starting later…" })).toHaveFocus()
    );
  });

  it("Discard mine drops the edit and shows the saved hours", async () => {
    const { dialog } = await refuseWeekly();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard mine" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull());
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Dinner, 5:00 PM–11:00 PM · Tue–Sun/ })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Lunch, 11:30 AM–3:00 PM · Tue–Fri/ })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("Overwrite saves the draft as it is against the version the dialog named", async () => {
    const { dialog } = await refuseWeekly();
    fireEvent.click(within(dialog).getByRole("button", { name: "Overwrite" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![0].body.expectedVersion).toBe(8);
  });

  it("a refused Overwrite is said inside the dialog, never swallowed", async () => {
    const { dialog } = await refuseWeekly();
    save.mockRejectedValueOnce(
      new ApiClientError({
        type: "about:blank",
        title: "invalid-config",
        status: 422,
        detail: "Server said no.",
        code: "invalid-config",
        issues: [
          { path: "scheduleServices.0", code: "overlap", message: "Lunch overlaps Dinner." },
        ],
      } as never)
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Overwrite" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Lunch overlaps Dinner.");
  });

  it("an Overwrite that meets a newer change says so and names it", async () => {
    const { dialog } = await refuseWeekly();
    save.mockRejectedValueOnce(
      new ApiClientError({
        type: "about:blank",
        title: "version-conflict",
        status: 409,
        detail: "Server said no.",
        code: "version-conflict",
        currentVersion: 9,
        winningChange: {
          id: "chg-9",
          actorId: "auth0|ana",
          at: "2026-10-25T22:50:00.000Z",
          kind: "config",
          summary: "Brunch opens at 9:00 AM",
        },
      } as never)
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Overwrite" }));
    expect(
      await within(dialog).findByText(/Someone saved again while you were deciding/)
    ).toBeTruthy();
    expect(within(dialog).getByText(/^Brunch opens at 9:00 AM/)).toBeTruthy();
  });
});
