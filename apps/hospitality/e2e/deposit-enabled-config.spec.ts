import { test, expect } from "./fixtures.js";
import { buildDepositEnabledPublicVenueConfigFixture } from "./api-mocks.js";

// Both surfaces below are gated on `deposit` from GET /public/v1/venues/:slug.
// The shared mockApi() default (api-mocks.ts) synthesizes a *disabled*
// deposit policy — correct as a default, but it means neither surface's
// enabled branch was ever exercised by any spec (#4061). These specs
// override the endpoint with buildDepositEnabledPublicVenueConfigFixture()
// instead of flipping the shared default, so both branches stay covered.

const VENUE_SLUG = "e2e-test-bistro";
const VENUE_NAME = "E2E Test Bistro";

test.describe("CancelReservationDialog fee banner — deposit-enabled venue", () => {
  // Frozen "now" — 6 hours before the mocked reservation's start time,
  // safely inside the fixture's 24h free-cancellation window (see
  // public-venue-config-deposit-enabled-mock.test.ts, which pins the exact
  // fee this combination produces). Freezing the clock — rather than relying
  // on the real reservation fixture's fixed time-of-day vs. whatever time CI
  // happens to run — makes the fee bucket deterministic: without it, "now"
  // could land on either side of the reservation's start time depending on
  // time of day, flipping the asserted fee between "late" and "no-show".
  const FROZEN_NOW = "2026-05-17T12:00:00.000Z";
  const RESERVATION_START = "2026-05-17T18:00:00.000Z";
  const RESERVATION_END = "2026-05-17T19:30:00.000Z";
  const RESERVATION_DATE = "2026-05-17";

  test("renders the fee banner with the quoted late-cancellation amount", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(FROZEN_NOW);

    await mockedPage.route("**/public/v1/venues/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: buildDepositEnabledPublicVenueConfigFixture() }),
      })
    );

    // Single controlled reservation — same shape as the shared
    // reservations-list.json fixture, with date/startTime/endTime pinned to
    // the frozen "now" above so the fee bucket is deterministic.
    await mockedPage.route("**/api/v1/reservations?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "res_e2e_deposit_fee",
              date: RESERVATION_DATE,
              startTime: RESERVATION_START,
              endTime: RESERVATION_END,
              partySize: 4,
              status: "CONFIRMED",
              notes: null,
              cancellationReason: null,
              cancellationNote: null,
              guestName: "Deposit Fee Guest",
              guestEmail: "deposit-fee@example.com",
              guestPhone: "+15551234567",
              guestId: "gst_e2e_001",
              userId: null,
              tableId: "tbl_e2e_001",
              table: {
                id: "tbl_e2e_001",
                name: "Table 1",
                tableNumber: "1",
                capacity: 4,
                minCovers: 1,
                maxCovers: 4,
                location: "Main Floor",
                isActive: true,
                priority: 1,
                status: "AVAILABLE",
                venueId: "ven_e2e_001",
                floorPlanId: "fp_e2e_001",
                shapeMetadata: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
              venueId: "ven_e2e_001",
              createdAt: "2026-05-10T12:00:00.000Z",
              updatedAt: "2026-05-10T12:00:00.000Z",
              occasion: null,
              seatingPreference: null,
            },
          ],
          pagination: {
            page: 1,
            limit: 200,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        }),
      })
    );

    await mockedPage.goto("timeline");

    const reservationBlock = mockedPage.getByTestId(/^reservation-block-/).first();
    await expect(reservationBlock).toBeVisible();
    await reservationBlock.click();

    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toBeVisible();

    await sidebar.getByRole("button", { name: "Cancel Reservation" }).click();

    const dialog = mockedPage.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const feeBanner = dialog.getByTestId("cancellation-fee-banner");
    await expect(feeBanner).toBeVisible();
    // Pinned exactly in public-venue-config-deposit-enabled-mock.test.ts —
    // the "late" fee bucket (feeAmountCents 2500, refundAmountCents 2500)
    // computed from this fixture's deposit numbers + the frozen "now".
    await expect(feeBanner).toContainText("Late cancellation fee: $25.00 — refund $25.00");
  });
});

test.describe("Booking widget deposit step — deposit-enabled venue", () => {
  test("omits Payment from the step indicator when no Stripe key is configured (#4975)", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/public/v1/venues/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: buildDepositEnabledPublicVenueConfigFixture() }),
      })
    );

    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();

    // BookingWidget derives its step list purely from useBookingFlow's
    // `depositRequired`, computed by `provisionalDepositRequired` (#4975),
    // which now delegates to `effectiveDepositPolicy` — requiring
    // `stripePublishableKey`, not just the venue's `deposit.enabled` flag
    // (useBookingFlow.ts, effectiveDepositPolicy.ts). Prior to #4975 this
    // test asserted the opposite (Payment shown from `.enabled` alone),
    // which was exactly the provisional/confirm-time verdict drift that
    // issue fixed: the step indicator promised a Payment step the confirm
    // path would then retract once it noticed no Stripe key.
    //
    // .github/workflows/e2e.yml does not set VITE_STRIPE_PUBLISHABLE_KEY for
    // the Hospitality E2E job (tracked separately by #4111) — there is no
    // Stripe test key configured for this environment, so the corrected,
    // key-aware verdict is "no deposit" here. That's a CI environment gap,
    // not something to work around with an invented test affordance.
    const stepsList = mockedPage.getByRole("list", { name: "Progress steps" });
    await expect(stepsList.getByText("Payment")).not.toBeVisible();
  });
});
