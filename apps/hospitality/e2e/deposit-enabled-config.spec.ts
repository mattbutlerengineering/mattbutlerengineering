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
  test("reaches the Payment step and renders Stripe Elements once a Stripe key is configured (#4111)", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/public/v1/venues/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: buildDepositEnabledPublicVenueConfigFixture() }),
      })
    );

    // The guest-recognition lookup fires on email blur — a multi-segment
    // path the single-segment glob above doesn't match. Stub it so it
    // resolves instead of hitting the real network (see
    // booking-widget-calendar.spec.ts, which needs the same stub).
    await mockedPage.route("**/public/v1/venues/*/guests/recognize*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { recognized: false, firstName: null, visitCount: 0, hasPreferences: false },
        }),
      })
    );

    // The shared holds-create mock in api-mocks.ts returns a fixed
    // `expiresAt` in the past relative to "now" — the hold-expiry timer
    // (useBookingFlow.ts) fires ~1s after confirmation and would reset the
    // flow back to time-slot before the Elements assertions below run (same
    // fix as booking-widget-calendar.spec.ts). Override with a future expiry
    // scoped to this test only.
    await mockedPage.route("**/public/v1/venues/*/holds", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "hold_e2e_deposit_payment_001",
            venueId: "ven_e2e_001",
            tableId: "tbl_e2e_001",
            date: "2026-05-17",
            startTime: "2026-05-17T18:00:00.000Z",
            endTime: "2026-05-17T19:30:00.000Z",
            partySize: 2,
            sessionId: "sess_e2e_deposit_payment_001",
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        }),
      })
    );

    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();

    // Step 1: Date & Party
    const bookingDate = new Date();
    bookingDate.setDate(bookingDate.getDate() + 3);
    await mockedPage.getByLabel("Date").fill(bookingDate.toISOString().slice(0, 10));
    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();

    // Step 2: Time — pick the first available slot.
    await mockedPage.getByRole("option").first().click();

    // Step 3: Guest details
    await mockedPage.getByLabel("Name").fill("Deposit Payment E2E Guest");
    await mockedPage.getByLabel("Email").fill("deposit-payment-e2e@example.com");
    await mockedPage.getByRole("button", { name: "Complete Reservation" }).click();

    // BookingWidget derives its step list purely from useBookingFlow's
    // `depositRequired`, resolved at confirm time by `effectiveDepositPolicy`
    // (#4975) — which requires BOTH the venue's deposit policy AND a
    // `stripePublishableKey`. Before #4111, `.github/workflows/e2e.yml`
    // never set VITE_STRIPE_PUBLISHABLE_KEY, so the verdict here was always
    // "no deposit" and the flow landed on Confirmation. With the key now
    // wired into this job's env, the verdict flips and the flow lands on
    // Payment instead — this assertion would fail loudly (not silently pass)
    // if the key stopped reaching the client bundle.
    const stepsList = mockedPage.getByRole("list", { name: "Progress steps" });
    await expect(stepsList.getByText("Payment")).toBeVisible();

    // Stripe Elements (PaymentStep.tsx) mounts a real iframe once
    // loadStripe() resolves against the real Stripe.js CDN — confirming the
    // publishable key actually reached the client and Stripe initialized.
    // Scoped to the labelled card-input container so it can't collide with
    // any other iframe on the page. Given a longer timeout than the default
    // 5s: this is a real network round trip to js.stripe.com, not a mock.
    const cardElementContainer = mockedPage.locator('[aria-labelledby="card-details-label"]');
    await expect(cardElementContainer).toBeVisible();
    await expect(cardElementContainer.locator("iframe")).toBeVisible({ timeout: 15_000 });

    // Deliberately stops here. Submitting the card form calls
    // POST /public/v1/venues/:slug/deposit-intent to create a real Stripe
    // PaymentIntent, which requires the reservations-api backend to hold its
    // OWN Stripe secret key (STRIPE_SECRET_KEY — a different credential from
    // VITE_STRIPE_PUBLISHABLE_KEY, see services/reservations/src/config/stripe.ts).
    // This E2E job's env does not provision that secret, so driving an actual
    // card submission would fail on the backend, not the frontend this test
    // is exercising — "Elements rendered" is the honest stopping point.
  });
});
