import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

/**
 * End-to-end coverage for "Add to calendar" (parts #1-#4, issues #3599-#3602):
 * completes the unauthenticated public booking flow
 * (`/hospitality/book/:venueSlug`, PublicBookingPage.tsx) through to
 * ConfirmationView, then verifies the downloaded .ics file and the Google
 * Calendar deep-link are both well-formed and reflect the confirmed
 * reservation's date/time.
 *
 * This route is public — no `authPage`/`mockedPage` fixture needed. All API
 * calls are intercepted directly so no real network traffic (or Auth0
 * session) is required to exercise it.
 */
const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const venue = (
  JSON.parse(readFileSync(join(FIXTURES_DIR, "venues-list.json"), "utf-8")) as {
    data: Array<Record<string, unknown>>;
  }
).data[0] as {
  id: string;
  slug: string;
  name: string;
  ianaTimezone: string;
  currencyCode: string;
  operatingHours: unknown;
};

// Fixed reservation window used to assert deterministic .ics/calendar-link
// output — 2026-05-17 18:00-19:30 UTC is 2:00-3:30 PM in the fixture venue's
// America/New_York timezone (EDT, UTC-4 in May).
const RESERVATION_START_UTC = "2026-05-17T18:00:00.000Z";
const RESERVATION_END_UTC = "2026-05-17T19:30:00.000Z";
const EXPECTED_LOCAL_START = "20260517T140000";
const EXPECTED_LOCAL_END = "20260517T153000";

const mockReservation = {
  id: "res_e2e_calendar_001",
  date: "2026-05-17",
  startTime: RESERVATION_START_UTC,
  endTime: RESERVATION_END_UTC,
  partySize: 4,
  status: "CONFIRMED",
  notes: null,
  cancellationReason: null,
  cancellationNote: null,
  guestName: "Jamie Rivera",
  guestEmail: "jamie@example.com",
  guestPhone: null,
  guestId: "gst_e2e_calendar_001",
  userId: null,
  tableId: "tbl_e2e_001",
  table: null,
  venueId: venue.id,
  createdAt: "2026-05-10T12:00:00.000Z",
  updatedAt: "2026-05-10T12:00:00.000Z",
  occasion: null,
  seatingPreference: null,
};

const mockHold = {
  id: "hold_e2e_calendar_001",
  venueId: venue.id,
  tableId: "tbl_e2e_001",
  date: "2026-05-17",
  startTime: RESERVATION_START_UTC,
  endTime: RESERVATION_END_UTC,
  partySize: 4,
  sessionId: "sess_e2e_calendar_001",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  createdAt: new Date().toISOString(),
};

function jsonOk(route: Route, data: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
}

/** A date within the widget's allowed [today, today+30d] window. */
function futureDateString(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function mockPublicBookingApi(page: Page): Promise<void> {
  await page.route(`**/api/v1/venues/by-slug/${venue.slug}`, (route) => jsonOk(route, venue));

  // Public venue config — powers ConfirmationView's "Add to calendar" section.
  // Must satisfy PublicVenueConfigSchema (validated client-side); the plain
  // Venue shape used elsewhere in the suite does not (no `deposit` field).
  await page.route(`**/public/v1/venues/${venue.slug}`, (route) =>
    jsonOk(route, {
      name: venue.name,
      slug: venue.slug,
      ianaTimezone: venue.ianaTimezone,
      currencyCode: venue.currencyCode,
      operatingHours: venue.operatingHours,
      settings: {},
      deposit: {
        enabled: false,
        depositType: null,
        amountCents: null,
        freeCancellationHours: null,
        lateCancellationFeePercent: null,
        noShowFeePercent: null,
      },
    })
  );

  // Guest recognition fires on the email field's blur — harmless no-op here.
  await page.route(`**/public/v1/venues/${venue.slug}/guests/recognize*`, (route) =>
    jsonOk(route, {
      recognized: false,
      firstName: null,
      visitCount: 0,
      hasPreferences: false,
      lastVisit: null,
    })
  );

  await page.route(`**/api/v1/availability/${venue.id}*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            time: RESERVATION_START_UTC,
            available: true,
            tables: [
              { id: "tbl_e2e_001", name: "Table 1", capacity: 4, minCovers: 1, maxCovers: 4 },
            ],
          },
        ],
      }),
    })
  );

  await page.route("**/api/v1/holds", (route) => jsonOk(route, mockHold));
  await page.route(/\/api\/v1\/holds\/[^/?]+\/confirm$/, (route) => jsonOk(route, mockReservation));
}

test.describe("Booking widget — add to calendar", () => {
  test("completes a public booking and downloads a working .ics + Google Calendar link", async ({
    page,
  }) => {
    await mockPublicBookingApi(page);
    await page.goto(`book/${venue.slug}`);

    await expect(page.getByRole("heading", { name: venue.name, level: 1 })).toBeVisible();

    // Step 1: date & party — defaults (party size 2) are fine, just pick a date.
    await page.getByLabel("Date").fill(futureDateString(5));
    await page.getByRole("button", { name: "Find Available Times" }).click();

    // Step 2: time slot — select the only mocked slot, which creates a hold.
    await page.getByRole("option").first().click();

    // Step 3: guest details — submit confirms the reservation.
    await page.getByLabel("Name").fill("Jamie Rivera");
    await page.getByLabel("Email").fill("jamie@example.com");
    await page.getByLabel("Email").blur();
    await page.getByRole("button", { name: "Complete Reservation" }).click();

    // Step 4: confirmation.
    await expect(page.getByRole("heading", { name: "Reservation Confirmed!" })).toBeVisible();
    await expect(page.getByText("Add to Calendar")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .ics" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const icsContent = readFileSync(downloadPath as string, "utf-8");

    expect(icsContent).toContain("BEGIN:VCALENDAR");
    expect(icsContent).toContain(`SUMMARY:${venue.name} Reservation`);
    expect(icsContent).toContain(`DTSTART;TZID=${venue.ianaTimezone}:${EXPECTED_LOCAL_START}`);
    expect(icsContent).toContain(`DTEND;TZID=${venue.ianaTimezone}:${EXPECTED_LOCAL_END}`);

    const googleHref = await page
      .getByRole("link", { name: "Google Calendar" })
      .getAttribute("href");
    expect(googleHref).toBeTruthy();
    const googleUrl = new URL(googleHref as string);
    expect(googleUrl.hostname).toBe("calendar.google.com");
    expect(googleUrl.searchParams.get("dates")).toBe(
      `${EXPECTED_LOCAL_START}/${EXPECTED_LOCAL_END}`
    );
    expect(googleUrl.searchParams.get("location")).toBe(venue.name);
    expect(googleUrl.searchParams.get("ctz")).toBe(venue.ianaTimezone);
  });
});
