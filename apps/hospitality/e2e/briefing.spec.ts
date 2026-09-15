import { test, expect, type Page } from "./fixtures.js";

/**
 * Tonight's Service (Briefing) — ux.md Screen 1 / audit A2 + A10.
 *
 * `/api/v1/briefing` is not part of `mockApi`, so each test mounts its own route. Fixtures are
 * built on the runner's local day and the browser clock is pinned to 20:00 local, so a booking at
 * 17:30 local sits past the UTC rollover west of Greenwich — the exact case A2 measured.
 */

const localToday = new Date().toLocaleDateString("en-CA");
const atLocal = (hhmm: string) => new Date(`${localToday}T${hhmm}:00`).toISOString();

function briefingEntry(
  id: string,
  startLocal: string,
  guestName: string,
  guest: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    date: localToday,
    startTime: atLocal(startLocal),
    endTime: atLocal(startLocal.replace(/^(\d{2})/, (h) => String(Number(h) + 1).padStart(2, "0"))),
    partySize: 2,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName,
    guestId: `gst_${id}`,
    userId: null,
    occasion: null,
    seatingPreference: null,
    tableId: "tbl_e2e_001",
    table: { id: "tbl_e2e_001", name: "Table 1", tableNumber: "1" },
    venueId: "ven_e2e_001",
    createdAt: atLocal("00:00"),
    updatedAt: atLocal("00:00"),
    guest: {
      id: `gst_${id}`,
      name: guestName,
      lastVisit: null,
      notes: null,
      staffNotes: [],
      communicationPreference: null,
      ...guest,
    },
    ...extra,
  };
}

const tonight = [
  briefingEntry("early", "17:30", "Early Guest", {
    visitCount: 1,
    dietaryRestrictions: null,
    tags: null,
  }),
  briefingEntry(
    "dinner",
    "18:30",
    "Priya Shah",
    {
      visitCount: 12,
      dietaryRestrictions: ["shellfish allergy", "vegetarian"],
      tags: ["VIP", "wine-club"],
    },
    { occasion: "anniversary", partySize: 4 }
  ),
  briefingEntry("late", "21:00", "Jordan Lee", {
    visitCount: 1,
    dietaryRestrictions: null,
    tags: [],
  }),
];

async function openBriefing(page: Page, entries: unknown[] = tonight): Promise<void> {
  await page.route("**/api/v1/briefing?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: entries }),
    })
  );
  await page.clock.setFixedTime(new Date(`${localToday}T20:00:00`));
  await page.goto("briefing");
  await expect(page.getByRole("heading", { name: "Tonight's Service", level: 1 })).toBeVisible();
}

test.describe("Briefing: Tonight's Service", () => {
  test("buckets on the local hour and prints times from the shared formatter (A2)", async ({
    mockedPage,
  }) => {
    await openBriefing(mockedPage);

    // All: three parties, no leading zeros.
    await expect(mockedPage.getByText("5:30 PM")).toBeVisible();
    await expect(mockedPage.getByText("6:30 PM")).toBeVisible();
    await expect(mockedPage.getByText("9:00 PM")).toBeVisible();

    await mockedPage.getByRole("radio", { name: "Early (before 6 PM)", exact: true }).click();
    await expect(mockedPage.getByText("Early Guest")).toBeVisible();
    await expect(mockedPage.getByText("Priya Shah")).toHaveCount(0);
    await expect(mockedPage.getByText("Jordan Lee")).toHaveCount(0);

    await mockedPage.getByRole("radio", { name: "Dinner (6–8 PM)", exact: true }).click();
    await expect(mockedPage.getByText("Priya Shah")).toBeVisible();
    await expect(mockedPage.getByText("Early Guest")).toHaveCount(0);

    await mockedPage.getByRole("radio", { name: "Late (after 8 PM)", exact: true }).click();
    await expect(mockedPage.getByText("Jordan Lee")).toBeVisible();
    await expect(mockedPage.getByText("Priya Shah")).toHaveCount(0);
    await mockedPage.screenshot({ path: "e2e/screenshots/briefing-late.png", fullPage: true });
  });

  test("shows the VIP badge and tags only the allergy red (A10)", async ({ mockedPage }) => {
    await openBriefing(mockedPage);

    await expect(mockedPage.getByText("VIP", { exact: true })).toBeVisible();
    await expect(mockedPage.getByText("wine-club")).toHaveCount(0);
    await expect(mockedPage.getByText("Allergy: shellfish allergy")).toBeVisible();
    await expect(mockedPage.getByText("vegetarian", { exact: true })).toBeVisible();
    await expect(mockedPage.getByText("shellfish allergy", { exact: true })).toHaveCount(0);
  });

  test("breadcrumb reads Tonight's Service, not Details (A10.4)", async ({ mockedPage }) => {
    await openBriefing(mockedPage);

    const breadcrumb = mockedPage.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByText("Tonight's Service")).toBeVisible();
    await expect(breadcrumb.getByText("Details")).toHaveCount(0);
  });

  test("500 → titled alert with the house sentence, Retry recovers without a reload (B1)", async ({
    mockedPage,
  }) => {
    let failing = true;
    await mockedPage.route("**/api/v1/briefing?*", (route) =>
      failing
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: '{"error":"server error"}',
          })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: tonight }),
          })
    );
    await mockedPage.clock.setFixedTime(new Date(`${localToday}T20:00:00`));
    await mockedPage.goto("briefing");

    // Filtered by title: DashboardLayout's session Banner is also role=alert when a real Auth0
    // session hiccups in CI, and an unfiltered getByRole would strict-mode against it.
    const alert = mockedPage
      .getByRole("alert")
      .filter({ hasText: "Couldn't load tonight's briefing." });
    await expect(alert).toContainText("Couldn't load tonight's briefing.");
    await expect(alert).toContainText(
      "The reservations service hit a snag — nothing was changed. Try again in a moment."
    );
    await expect(mockedPage.getByText(/failed: 500/)).toHaveCount(0);
    // Segments stay operable beside the banner.
    await expect(mockedPage.getByRole("radio", { name: "All", exact: true })).toBeVisible();

    failing = false;
    await alert.getByRole("button", { name: "Retry" }).click();

    await expect(mockedPage.getByText("Priya Shah")).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expect(
      mockedPage.getByRole("status").filter({ hasText: /^Briefing for .* loaded\.$/ })
    ).toBeVisible();
  });
});
