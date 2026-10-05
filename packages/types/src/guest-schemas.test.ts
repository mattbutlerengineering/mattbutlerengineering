import { describe, it, expect, expectTypeOf } from "vitest";
import type { z } from "zod";
import { LapsingGuestSchema, WinBackResultSchema } from "./schemas/guest.js";
import type {
  CreateGuestBodySchema,
  UpdateGuestBodySchema,
} from "./schemas/reservation-requests.js";
import type { LapsingGuest, CreateGuestRequest, UpdateGuestRequest } from "./guest.js";

/** Type-level contract, enforced by `pnpm typecheck` (tsconfig.test.json); compiled, never run. */
function _typeLevelAssertions(): void {
  // The hand interfaces are now aliases of the schemas — same names, same shapes.
  expectTypeOf<LapsingGuest>().toEqualTypeOf<z.infer<typeof LapsingGuestSchema>>();
  expectTypeOf<CreateGuestRequest>().toEqualTypeOf<z.input<typeof CreateGuestBodySchema>>();
  expectTypeOf<UpdateGuestRequest>().toEqualTypeOf<z.input<typeof UpdateGuestBodySchema>>();
  expectTypeOf<LapsingGuest["communicationPreference"]>().toEqualTypeOf<
    "email_only" | "sms_only" | "both" | "transactional_only"
  >();
}
void _typeLevelAssertions;

// A payload in the shape GET /api/v1/guests/lapsing serializes today
// (guestService.scanLapsedGuests → routes/guests.ts).
const recordedLapsing = {
  guestId: "gst_1",
  name: "Ada",
  email: null,
  phone: "+15555550100",
  communicationPreference: "sms_only",
  avgFrequencyDays: 14,
  daysSinceLastVisit: 40,
  daysOverdue: 12,
};

describe("LapsingGuestSchema", () => {
  it("parses a recorded lapsing payload, nullable email/phone included", () => {
    expect(LapsingGuestSchema.parse(recordedLapsing)).toEqual(recordedLapsing);
  });

  it("rejects a communicationPreference outside the Guest enum (decision 2)", () => {
    expect(
      LapsingGuestSchema.safeParse({
        ...recordedLapsing,
        communicationPreference: "carrier_pigeon",
      }).success
    ).toBe(false);
  });
});

describe("WinBackResultSchema", () => {
  it("is { sent: boolean }", () => {
    expect(WinBackResultSchema.parse({ sent: false })).toEqual({ sent: false });
    expect(WinBackResultSchema.safeParse({ sent: "yes" }).success).toBe(false);
  });
});
