import { describe, expect, it, vi } from "vitest";
import { createClosureNoticeDeps } from "./closure-notice-runtime.js";
import type { NoticeOutcome } from "./closure-notice.js";

const outcome = (over: Partial<NoticeOutcome> = {}): NoticeOutcome => ({
  outcomeId: "o1",
  venueId: "v1",
  reservationId: "res1",
  action: "cancel",
  deliveries: {},
  rebooked: false,
  closureDate: "2026-12-24",
  message: null,
  startTime: new Date("2026-12-24T19:00:00.000Z"),
  partySize: 2,
  guestName: "Ana",
  guestEmail: "ana@example.com",
  guestPhone: null,
  preference: null,
  refund: null,
  venueName: "Bistro Lune",
  timezone: "UTC",
  originHost: null,
  ...over,
});

function makeDispatcher() {
  return {
    sendClosureEmail: vi.fn().mockResolvedValue(undefined),
    sendClosureSms: vi.fn().mockResolvedValue(undefined),
    smsEnabled: true,
  };
}

describe("createClosureNoticeDeps", () => {
  it("builds the manage link from manageBaseUrl when no hostBrand resolver is given (today's behavior)", () => {
    const deps = createClosureNoticeDeps({
      dispatcher: makeDispatcher(),
      generateManageToken: () => "tok_1",
      manageBaseUrl: "https://mattbutlerengineering.com",
      logger: { warn: vi.fn() },
    });

    expect(deps.manageUrl(outcome())).toBe(
      "https://mattbutlerengineering.com/hospitality/reservations/manage?token=tok_1"
    );
  });

  // #7892: a closure notice's manage link follows the booking's origin host.
  it("builds the manage link from the hostBrand resolver's manageBaseUrl for an eat-sheet.com outcome", () => {
    const deps = createClosureNoticeDeps({
      dispatcher: makeDispatcher(),
      generateManageToken: () => "tok_1",
      manageBaseUrl: "https://mattbutlerengineering.com",
      hostBrand: (originHost) =>
        originHost === "eat-sheet.com"
          ? { manageBaseUrl: "https://eat-sheet.com" }
          : { manageBaseUrl: "https://mattbutlerengineering.com" },
      logger: { warn: vi.fn() },
    });

    expect(deps.manageUrl(outcome({ originHost: "eat-sheet.com" }))).toBe(
      "https://eat-sheet.com/reservations/manage?token=tok_1"
    );
  });

  it("keeps the mattbutlerengineering.com manage link for a null origin host, even with a hostBrand resolver", () => {
    const deps = createClosureNoticeDeps({
      dispatcher: makeDispatcher(),
      generateManageToken: () => "tok_1",
      manageBaseUrl: "https://mattbutlerengineering.com",
      hostBrand: (originHost) =>
        originHost === "eat-sheet.com"
          ? { manageBaseUrl: "https://eat-sheet.com" }
          : { manageBaseUrl: "https://mattbutlerengineering.com" },
      logger: { warn: vi.fn() },
    });

    expect(deps.manageUrl(outcome())).toBe(
      "https://mattbutlerengineering.com/hospitality/reservations/manage?token=tok_1"
    );
  });
});
