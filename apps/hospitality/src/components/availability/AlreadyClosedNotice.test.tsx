import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ToastProvider } from "@mattbutlerengineering/rialto";
import type { AvailabilityConfigState, DateRule } from "@mbe/types";

const create = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useClosures.js", () => ({
  useCreateClosure: () => ({ mutateAsync: create, isPending: false }),
  useClosureImpact: () => ({
    data: { reservations: 0, covers: 0, depositsHeld: 0, groups: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../hooks/useRefreshAvailability.js", () => ({
  useRefreshAvailability: () => vi.fn(),
}));
vi.mock("@mbe/auth/react", () => ({ useAuth: () => ({ user: { id: "auth0|me" } }) }));
vi.mock("../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import { CloseDialog } from "./CloseDialog.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };
const CHRISTMAS = "2026-12-25";

const closure = (fields: Partial<DateRule> = {}): DateRule =>
  ({
    id: "first",
    kind: "closure",
    targetKind: "venue",
    startsOn: CHRISTMAS,
    endsOn: CHRISTMAS,
    window: null,
    ...fields,
  }) as DateRule;

function renderDialog(
  dateRules: readonly DateRule[],
  extra: Partial<React.ComponentProps<typeof CloseDialog>> = {}
) {
  const state: AvailabilityConfigState = {
    config: { ...fixtureConfig(), dateRules: [...dateRules] },
    version: 7,
    source: "rows",
  };
  return render(
    <ToastProvider>
      <main>
        <CloseDialog
          venueId="venue-1"
          state={state}
          timezone="America/Los_Angeles"
          today="2026-12-01"
          initialDate={CHRISTMAS}
          onClose={vi.fn()}
          {...extra}
        />
      </main>
    </ToastProvider>
  );
}

const pick = (name: RegExp | string) => fireEvent.click(screen.getByRole("radio", { name }));

describe("closing a date that is already closed (#8006)", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({
      ruleId: "new",
      version: 8,
      changeId: "c",
      outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
    });
  });

  it("warns, naming the closure that already closes it, and still lets the Manager save", async () => {
    const { container } = renderDialog([closure()]);

    expect(screen.getByText("Already closed")).toBeTruthy();
    expect(screen.getByText("Already closed on Fri, Dec 25: Whole venue.")).toBeTruthy();
    expect(screen.getByText(/Reopening one closure leaves the date closed/)).toBeTruthy();
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);

    fireEvent.click(screen.getByTestId("close-primary"));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  });

  it("names a longer closure by its span", () => {
    renderDialog([closure({ startsOn: "2026-12-24", endsOn: "2026-12-27" })]);
    expect(
      screen.getByText("Already closed on Fri, Dec 25: Whole venue · Thu, Dec 24 to Sun, Dec 27.")
    ).toBeTruthy();
  });

  it("says nothing on a date no closure touches", () => {
    renderDialog([closure({ startsOn: "2026-12-26", endsOn: "2026-12-26" })]);
    expect(screen.queryByText(/Already closed/)).toBeNull();
  });

  it("says which date of a range is closed, without calling the whole range closed", () => {
    renderDialog([closure()], { initialDate: "2026-12-24" });
    pick("Date range");
    // The range starts on the 24th and runs a week, so it holds the 25th.
    expect(screen.getByText("Some dates are already closed")).toBeTruthy();
    expect(screen.getByText("Already closed on Fri, Dec 25: Whole venue.")).toBeTruthy();
    expect(screen.queryByText("Already closed")).toBeNull();
    expect(screen.getByTestId("close-primary")).not.toBeDisabled();
  });

  it("does not warn of a service or a from-time closure when closing the whole venue", () => {
    const dinner = closure({ targetKind: "service", venueServiceId: "vs-dinner" });
    const fromSix = closure({ id: "later", window: { version: 1, from: 1080, to: 2880 } });
    renderDialog([dinner, fromSix]);
    expect(screen.queryByText(/already closed/i)).toBeNull();
  });

  it("does not warn of a closed venue when pausing a booking channel", () => {
    renderDialog([closure()]);
    pick("Booking only");
    expect(screen.queryByText(/already closed/i)).toBeNull();
    expect(screen.getByTestId("close-primary")).not.toBeDisabled();
  });

  it("warns of the same channel paused already, naming the channel", () => {
    renderDialog([closure({ targetKind: "booking", bookingTypes: ["online"] })]);
    pick("Booking only");
    expect(screen.getByText("Already closed on Fri, Dec 25: Booking: Online.")).toBeTruthy();
  });

  it("does not read a one-date edit of a series as closed by that series", () => {
    const series = closure({
      id: "series-1",
      startsOn: "2026-12-04",
      endsOn: "2027-01-29",
      repeat: { version: 1, weekdays: [5] },
    });
    renderDialog([series], { series });
    expect(screen.queryByText(/already closed/i)).toBeNull();
  });

  it("names a repeating closure by its days", () => {
    renderDialog([
      closure({
        id: "fridays",
        startsOn: "2026-12-04",
        endsOn: "2027-01-29",
        repeat: { version: 1, weekdays: [5] },
      }),
    ]);
    expect(
      screen.getByText(
        "Already closed on Fri, Dec 25: Whole venue · every Friday (Fri, Dec 4 to Fri, Jan 29)."
      )
    ).toBeTruthy();
  });

  it("lists a few dates and counts the rest", () => {
    const year = closure({ startsOn: "2026-12-01", endsOn: "2027-06-30" });
    renderDialog([year], { initialDate: "2026-12-07" });
    pick("Date range");
    expect(
      screen.getByText(
        "Already closed on Mon, Dec 7, Tue, Dec 8, Wed, Dec 9 and 4 more dates: Whole venue · Tue, Dec 1 to Wed, Jun 30."
      )
    ).toBeTruthy();
  });
});
