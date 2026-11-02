import { describe, expect, it } from "vitest";
import { ApiClientError } from "@mbe/api-client";
import type { ClosureImpactGroup } from "@mbe/types";
import { defaultT } from "../../i18n/default-t.js";
import { formatCalendarDate, formatTimeIn } from "../../utils/format.js";
import { refusalOf, refusalText } from "./step-two-refusal.js";

const moveUnavailable = (reservationIds: string[]) =>
  new ApiClientError(
    {
      type: "about:blank",
      title: "Unprocessable Entity",
      status: 422,
      detail: "Some bookings have no open time to move to; choose another outcome.",
      code: "move-unavailable",
      reservationIds,
    } as never,
    "POST",
    "closures"
  );

const booking = (id: string, name: string | null, start: string) => ({
  id,
  startTime: start,
  endTime: start,
  partySize: 4,
  guestName: name,
  deposit: null,
  runsIntoClosure: false,
});

const format = {
  formatTime: (iso: string) => formatTimeIn(iso, "America/Los_Angeles", "en-US"),
  formatCalendarDate: (date: string, options: Intl.DateTimeFormatOptions) =>
    formatCalendarDate(date, options, "en-US"),
};

const GROUPS: ClosureImpactGroup[] = [
  {
    groupKey: "2026-12-24:shortened",
    date: "2026-12-24",
    kind: "shortened",
    covers: 12,
    depositsHeld: 0,
    reservations: [
      booking("r1", "Rivera", "2026-12-25T03:30:00.000Z"),
      booking("r2", "Chen", "2026-12-25T04:00:00.000Z"),
      booking("r3", null, "2026-12-25T04:15:00.000Z"),
    ],
  },
];

describe("a move the server refused", () => {
  it("is told apart, with the bookings the server named", () => {
    expect(refusalOf(moveUnavailable(["r1"]))).toEqual({
      kind: "move-unavailable",
      reservationIds: ["r1"],
    });
  });

  it("names each booking, its date and time, and says nothing was saved or sent", () => {
    const text = refusalText(refusalOf(moveUnavailable(["r1"])), defaultT, {
      groups: GROUPS,
      format,
    });

    expect(text).toContain("Couldn't move Rivera, Thu, Dec 24 at 7:30 PM");
    expect(text).toContain("Nothing was saved, no guest was told, and the booking keeps its time");
  });

  it("speaks for several, and counts the ones past the first few", () => {
    const many = Array.from({ length: 8 }, (_, i) => `x${i}`);
    const groups: ClosureImpactGroup[] = [
      {
        ...GROUPS[0]!,
        reservations: many.map((id, i) => booking(id, `Guest ${i}`, "2026-12-25T03:30:00.000Z")),
      },
    ];
    const text = refusalText(refusalOf(moveUnavailable(many)), defaultT, { groups, format });

    expect(text).toContain("these bookings keep their times");
    expect(text).toContain("Guest 0");
    expect(text).toContain("and 3 more");
    expect(text).not.toContain("Guest 7");
  });

  it("counts the bookings when none can be named, rather than naming nobody", () => {
    const text = refusalText(refusalOf(moveUnavailable(["gone", "gone-too"])), defaultT, {
      groups: GROUPS,
      format,
    });
    expect(text).toContain("Couldn't move 2 bookings: no open time fits.");
    expect(text).toContain("Nothing was saved");
    const one = refusalText(refusalOf(moveUnavailable(["gone"])), defaultT);
    expect(one).toContain("Couldn't move 1 booking: no open time fits.");
  });
});
