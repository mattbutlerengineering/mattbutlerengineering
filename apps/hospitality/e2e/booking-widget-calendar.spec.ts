import { readFileSync } from "fs";
import { test, expect } from "./fixtures.js";

// Deterministic — the shared api-mocks.ts fixture for
// **/api/v1/holds/*/confirm always returns reservations-list.json's first
// entry regardless of the requested date/party size, so the reservation
// (and therefore the calendar artifacts built from it) is fixed.
const VENUE_SLUG = "e2e-test-bistro";
const VENUE_NAME = "E2E Test Bistro";
const VENUE_TIMEZONE = "America/New_York";
const EXPECTED_START = "20260517T140000"; // 2026-05-17T18:00:00Z in America/New_York (EDT)
const EXPECTED_END = "20260517T153000"; // 2026-05-17T19:30:00Z in America/New_York (EDT)

function jsonOk(data: unknown): string {
  return JSON.stringify({ data });
}

test.describe("Public booking flow — Add to Calendar", () => {
  test("downloads a working .ics and builds a well-formed Google Calendar link", async ({
    mockedPage,
  }) => {
    // The shared api-mocks.ts public-venue-config mock (#4035) already
    // returns a schema-valid PublicVenueConfig with a disabled deposit for
    // this venue — no per-test override needed.

    // The guest-recognition lookup fires on email blur — a multi-segment
    // path the single-segment glob above doesn't match. Stub it too so it
    // resolves instead of hitting the real network.
    await mockedPage.route("**/public/v1/venues/*/guests/recognize*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonOk({
          recognized: false,
          firstName: null,
          visitCount: 0,
          hasPreferences: false,
          lastVisit: null,
        }),
      })
    );

    // The shared holds-create mock in api-mocks.ts returns a fixed
    // `expiresAt` in the past relative to "now" — the hold-expiry timer
    // (useBookingFlow.ts) fires ~1s after confirmation and resets the flow
    // back to time-slot before the download assertions below run. Override
    // with a future expiry scoped to this test only.
    await mockedPage.route("**/api/v1/holds", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonOk({
          id: "hold_e2e_calendar_001",
          venueId: "ven_e2e_001",
          tableId: "tbl_e2e_001",
          date: "2026-05-17",
          startTime: "2026-05-17T18:00:00.000Z",
          endTime: "2026-05-17T19:30:00.000Z",
          partySize: 2,
          sessionId: "sess_e2e_calendar_001",
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
          createdAt: new Date().toISOString(),
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
    await mockedPage.getByLabel("Name").fill("Cal E2E Guest");
    await mockedPage.getByLabel("Email").fill("cal-e2e@example.com");
    await mockedPage.getByRole("button", { name: "Complete Reservation" }).click();

    // Step 4: Confirmation
    await expect(mockedPage.getByText("Reservation Confirmed!")).toBeVisible();
    await expect(mockedPage.getByText("Add to Calendar")).toBeVisible();

    // Download the .ics and assert its contents.
    const [download] = await Promise.all([
      mockedPage.waitForEvent("download"),
      mockedPage.getByRole("button", { name: "Download .ics" }).click(),
    ]);
    const downloadPath = await download.path();
    if (!downloadPath) throw new Error("Download did not produce a local file");
    const icsContent = readFileSync(downloadPath, "utf-8");

    expect(icsContent).toContain("BEGIN:VCALENDAR");
    expect(icsContent).toContain(`SUMMARY:${VENUE_NAME} Reservation`);
    expect(icsContent).toContain(`DTSTART;TZID=${VENUE_TIMEZONE}:${EXPECTED_START}`);
    expect(icsContent).toContain(`DTEND;TZID=${VENUE_TIMEZONE}:${EXPECTED_END}`);

    // Google Calendar deep-link — well-formed and pointing at the same date.
    const googleHref = await mockedPage
      .getByRole("link", { name: "Google Calendar" })
      .getAttribute("href");
    expect(googleHref).not.toBeNull();
    const googleUrl = new URL(googleHref as string);
    expect(googleUrl.origin + googleUrl.pathname).toBe(
      "https://calendar.google.com/calendar/render"
    );
    expect(googleUrl.searchParams.get("text")).toBe(`${VENUE_NAME} Reservation`);
    expect(googleUrl.searchParams.get("location")).toBe(VENUE_NAME);
    expect(googleUrl.searchParams.get("dates")).toBe(`${EXPECTED_START}/${EXPECTED_END}`);
    expect(googleUrl.searchParams.get("ctz")).toBe(VENUE_TIMEZONE);
  });
});
