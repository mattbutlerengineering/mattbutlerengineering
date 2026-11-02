import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { ClosureImpact, ClosureNoticePreview } from "@mbe/types";

const preview = vi.hoisted(() => vi.fn());
const refetchPreview = vi.hoisted(() => vi.fn());
const previewState = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  error: null as unknown,
}));
vi.mock("../../hooks/useClosures.js", () => ({
  useClosureNoticePreview: (params: unknown) => {
    preview(params);
    return { ...previewState, refetch: refetchPreview };
  },
}));
// `useVenueFormat` reads this context, not `useVenue`: without it the times fall back to the
// device's zone, and the suite would pass or fail by where it runs.
const venue = vi.hoisted(() => ({ zone: "America/Los_Angeles" }));
vi.mock("../../contexts/venue-context-object.js", () => ({
  useOptionalVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: venue.zone, currencyCode: "USD" },
  }),
}));

import { CloseStepTwo } from "./CloseStepTwo.js";
import type { ChoiceMap } from "./close-draft.js";

const DATE = "2026-12-24";
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const booking = (
  id: string,
  name: string,
  start: string,
  proposedStart?: string | null,
  extra: object = {}
) => ({
  id,
  startTime: start,
  endTime: new Date(Date.parse(start) + 90 * 60_000).toISOString(),
  partySize: 4,
  guestName: name,
  deposit: null,
  runsIntoClosure: false,
  ...(proposedStart === undefined ? {} : { proposedStart }),
  ...extra,
});

/** Dec 24 shortened to 4-8 PM: Rivera (7:30 PM) can move to 6:00 PM, Chen (8:00 PM) to 6:30 PM. */
const SHORTENED: ClosureImpact = {
  reservations: 2,
  covers: 8,
  depositsHeld: 1,
  groups: [
    {
      groupKey: `${DATE}:shortened`,
      date: DATE,
      kind: "shortened",
      covers: 8,
      depositsHeld: 1,
      reservations: [
        booking("r1", "Rivera", "2026-12-25T03:30:00.000Z", "2026-12-25T02:00:00.000Z", {
          deposit: { amountCents: 4000, currency: "usd" },
          originHost: "eat-sheet.com",
        }),
        booking("r2", "Chen", "2026-12-25T04:00:00.000Z", "2026-12-25T02:30:00.000Z"),
      ],
    },
  ],
};

const STUCK: ClosureImpact = {
  ...SHORTENED,
  groups: [
    {
      ...SHORTENED.groups[0]!,
      reservations: [
        SHORTENED.groups[0]!.reservations[0]!,
        booking("r3", "Okafor", "2026-12-25T03:45:00.000Z", null),
      ],
    },
  ],
};

const NOTICE: ClosureNoticePreview = {
  email: {
    from: "eat-sheet <reservations@example.com>",
    subject: "Your reservation at Rivera Bistro on Thu, Dec 24 is cancelled",
    text: "Hi Rivera,\nRivera Bistro is closed on Thu, Dec 24.\nClosed for a private event",
  },
  sms: "Rivera Bistro is closed Thu Dec 24. Rebook: https://example.com/m?token=preview",
};

function renderStep(impact: ClosureImpact, choices: ChoiceMap = {}, guestMessage = "") {
  return render(
    <main>
      <CloseStepTwo
        venueId="venue-1"
        impact={impact}
        choices={choices}
        onChoose={vi.fn()}
        urgent={false}
        guestMessage={guestMessage}
      />
    </main>
  );
}

describe("CloseStepTwo: proposed moves and failed moves", () => {
  beforeEach(() => {
    preview.mockReset();
    refetchPreview.mockReset();
    Object.assign(previewState, { data: undefined, isLoading: false, error: null });
    venue.zone = "America/Los_Angeles";
  });

  it("shows every time on the venue's clock, wherever the browser is", () => {
    // The browser zone is whatever TZ the suite runs under; the venue is a day ahead of both
    // Pacific and UTC. The row and its proposed time must read Tokyo time.
    venue.zone = "Asia/Tokyo";
    renderStep(SHORTENED, { [`${DATE}:shortened`]: { action: "move", acknowledged: false } });

    const rows = screen.getAllByRole("listitem");
    // 03:30Z is 12:30 PM in Tokyo, and its proposed 02:00Z is 11:00 AM.
    expect(rows[0]).toHaveTextContent(/12:30 PM.*Rivera.*moves to 11:00 AM/);
    expect(rows[1]).toHaveTextContent(/1:00 PM.*Chen.*moves to 11:30 AM/);
  });

  it("lists the time each booking moves to once Move is chosen, and not before", () => {
    const { rerender } = renderStep(SHORTENED);
    expect(screen.queryByText(/moves to/)).toBeNull();

    rerender(
      <main>
        <CloseStepTwo
          venueId="venue-1"
          impact={SHORTENED}
          choices={{ [`${DATE}:shortened`]: { action: "move", acknowledged: false } }}
          onChoose={vi.fn()}
          urgent={false}
          guestMessage=""
        />
      </main>
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(/Rivera.*moves to 6:00 PM/);
    expect(rows[1]).toHaveTextContent(/Chen.*moves to 6:30 PM/);
  });

  it("names a booking with no open time, and says Move is unavailable and what to do instead", () => {
    renderStep(STUCK);

    const rows = screen.getAllByRole("listitem");
    expect(rows[1]).toHaveTextContent(/Okafor.*no open time to move to/);
    const move = screen.getByRole("radio", { name: /Move to the nearest open time/ });
    expect(move).toBeDisabled();
    // The choice is for the group: it says so, and names the booking that blocks it.
    expect(
      screen.getByText(
        "Move is unavailable for this group: 7:45 PM Okafor · 4 has no open time to move to. Any other choice applies to the whole group of 2."
      )
    ).toBeTruthy();
    // The other outcomes stay open.
    expect(screen.getByRole("radio", { name: /Keep them and notify/ })).not.toBeDisabled();
  });

  it("names a stuck booking in the hint even when the list is collapsed past it", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      booking(
        `m${i}`,
        `Guest ${i}`,
        `2026-12-25T03:${String(i * 5).padStart(2, "0")}:00.000Z`,
        `2026-12-25T02:00:00.000Z`
      )
    );
    const hidden = booking("hidden", "Okafor", "2026-12-25T04:30:00.000Z", null);
    renderStep({
      ...SHORTENED,
      groups: [{ ...SHORTENED.groups[0]!, reservations: [...many, hidden] }],
    });

    // Five rows are shown; the sixth to eighth are behind "Show all", and Okafor is the eighth.
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getAllByRole("listitem").some((row) => row.textContent?.includes("Okafor"))).toBe(
      false
    );
    expect(screen.getByText(/Move is unavailable for this group: .*Okafor/)).toBeTruthy();
  });

  it("offers Move when every booking has a time", () => {
    renderStep(SHORTENED);
    expect(screen.getByRole("radio", { name: /Move to the nearest open time/ })).not.toBeDisabled();
  });

  it("is axe-clean with a stuck booking", async () => {
    const { container } = renderStep(STUCK);
    expect((await axe(container, AXE_OPTIONS)).violations).toEqual([]);
  });
});

describe("CloseStepTwo: the guest message", () => {
  beforeEach(() => {
    preview.mockReset();
    Object.assign(previewState, { data: NOTICE, isLoading: false, error: null });
  });

  const chosen = (action: "cancel" | "move" | "keep_notify" | "keep_silent"): ChoiceMap => ({
    [`${DATE}:shortened`]: { action, acknowledged: false },
  });

  it("asks the server for the first booking's notice only after Preview message is opened", () => {
    renderStep(SHORTENED, chosen("cancel"), " Closed for a private event ");
    expect(preview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Preview message" }));

    expect(preview).toHaveBeenLastCalledWith({
      venueId: "venue-1",
      body: {
        action: "cancel",
        closureDate: DATE,
        startTime: "2026-12-25T03:30:00.000Z",
        partySize: 4,
        guestName: "Rivera",
        message: "Closed for a private event",
        refund: { amountCents: 4000, currency: "usd" },
        originHost: "eat-sheet.com",
      },
    });
  });

  it("shows what the server rendered, the email and the text message", () => {
    renderStep(SHORTENED, chosen("cancel"));
    fireEvent.click(screen.getByRole("button", { name: "Preview message" }));

    const region = screen.getByRole("region", { name: "Preview message" });
    expect(region.textContent).toContain("From: eat-sheet <reservations@example.com>");
    expect(region.textContent).toContain(NOTICE.email.subject);
    expect(region.textContent).toContain(NOTICE.email.text);
    expect(region.textContent).toContain(NOTICE.sms);
    expect(within(region).getByText("Email")).toBeTruthy();
    expect(within(region).getByText("Text message")).toBeTruthy();
    expect(within(region).getByText("Example: Rivera at 7:30 PM")).toBeTruthy();
  });

  it("previews a move at the proposed time, with no refund and a null message when none is typed", () => {
    renderStep(SHORTENED, chosen("move"));
    fireEvent.click(screen.getByRole("button", { name: "Preview message" }));

    expect(preview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          action: "move",
          startTime: "2026-12-25T02:00:00.000Z",
          message: null,
          refund: null,
        }),
      })
    );
  });

  it("says so, with a retry, when the message cannot be loaded", () => {
    Object.assign(previewState, { data: undefined, error: new Error("boom") });
    renderStep(SHORTENED, chosen("cancel"));
    fireEvent.click(screen.getByRole("button", { name: "Preview message" }));

    expect(screen.getByText("Couldn't load the message.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetchPreview).toHaveBeenCalled();
  });

  it("has no preview for a booking the guest is not told about", () => {
    renderStep(SHORTENED, chosen("keep_silent"));
    expect(screen.queryByRole("button", { name: "Preview message" })).toBeNull();
  });
});
