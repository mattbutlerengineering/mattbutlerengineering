import { test, expect } from "./fixtures.js";
import { ERROR_COPY } from "../src/lib/describe-api-error.js";
import { DB_NAME } from "../src/lib/offline-cache.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

const KPI_LABELS = ["Total", "Confirmed", "Pending", "Cancelled"] as const;

test.describe("CF-6: Reservations page with filtering", () => {
  test("page loads with header and KPIs counted from the fixture", async ({ mockedPage }) => {
    await mockedPage.goto("reservations");

    await expect(
      mockedPage.getByRole("heading", { name: "Reservations", exact: true })
    ).toBeVisible();

    // Four KPI groups, named by label (rialto Stat); the fixture holds 4 reservations.
    await expect(mockedPage.getByRole("group", { name: "Total", exact: true })).toHaveText(
      /^Total\s*4$/
    );
    await expect(mockedPage.getByRole("group", { name: "Cancelled", exact: true })).toHaveText(
      /^Cancelled\s*1$/
    );
    await mockedPage.screenshot({ path: "e2e/screenshots/reservations-list.png", fullPage: true });
  });

  test("displays status filter segments and search input", async ({ mockedPage }) => {
    await mockedPage.goto("reservations");

    await expect(mockedPage.getByRole("radio", { name: "All" })).toBeVisible();
    await expect(mockedPage.getByRole("radio", { name: "Confirmed" })).toBeVisible();
    await expect(mockedPage.getByRole("radio", { name: "Pending" })).toBeVisible();
    await expect(mockedPage.getByRole("radio", { name: "Cancelled" })).toBeVisible();

    const searchInput = mockedPage.getByPlaceholder("Search by guest name...");
    await expect(searchInput).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/reservations-filters.png",
      fullPage: true,
    });
  });

  test("status filter updates list when Confirmed is selected", async ({ mockedPage }) => {
    await mockedPage.goto("reservations");

    await mockedPage.getByRole("radio", { name: "Confirmed" }).click();

    await expect(mockedPage).toHaveURL(/status=CONFIRMED/);
  });

  test("search input filters the reservation list", async ({ mockedPage }) => {
    await mockedPage.goto("reservations");

    const searchInput = mockedPage.getByPlaceholder("Search by guest name...");
    await searchInput.fill("Test");

    const resultCount = mockedPage
      .locator('[aria-live="polite"]', { hasText: /reservation/ })
      .last();
    await expect(resultCount).toBeVisible();
  });

  test("All filter clears status selection", async ({ mockedPage }) => {
    await mockedPage.goto("reservations?status=CONFIRMED");

    await mockedPage.getByRole("radio", { name: "All" }).click();

    await expect(mockedPage).not.toHaveURL(/status=CONFIRMED/);
  });

  test("shows empty state when no results match search", async ({ mockedPage }) => {
    await mockedPage.goto("reservations");

    const searchInput = mockedPage.getByPlaceholder("Search by guest name...");
    await searchInput.fill("zzzzz-no-match-9999");

    await expect(mockedPage.getByText("No reservations", { exact: true })).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/reservations-empty.png", fullPage: true });
  });

  test("500 → titled banner, Retry, KPI dashes; recovery fills rows and KPIs without a reload (S13/S14)", async ({
    mockedPage,
  }) => {
    // Registered AFTER mockApi so it wins (LIFO); once `failing` flips, fall back to the 200 mock.
    let failing = true;
    await mockedPage.route("**/api/v1/reservations?*", (route) =>
      failing
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: '{"error":"server error"}',
          })
        : route.fallback()
    );
    // The fixture's warm-up `goto("")` lands on /timeline, whose useReservations may have written
    // today's key to the IndexedDB offline cache; a cached day would answer the 500 with rows and
    // hide the error state. Drop the database at document start so the cache is provably empty.
    await mockedPage.addInitScript((name) => {
      indexedDB.deleteDatabase(name);
    }, DB_NAME);
    await mockedPage.goto("reservations");

    // Filtered by title: DashboardLayout's session Banner is also role=alert in CI.
    const alert = mockedPage.getByRole("alert").filter({ hasText: "Couldn't load reservations." });
    await expect(alert).toContainText("Couldn't load reservations.");
    await expect(alert).toContainText(ERROR_COPY.serverError.detail);
    // Raw request line stays collapsed behind "Show details".
    await expect(mockedPage.getByText(/failed: 500/)).toHaveCount(0);

    for (const label of KPI_LABELS) {
      await expect(
        mockedPage.getByRole("group", { name: `${label}, unavailable`, exact: true })
      ).toContainText("—");
    }
    await expect(mockedPage.getByRole("row")).toHaveCount(0);
    await expect(mockedPage.getByText("No reservations", { exact: true })).toHaveCount(0);
    await expect(
      mockedPage.getByRole("button", { name: "New reservation", exact: true })
    ).toBeEnabled();
    await mockedPage.screenshot({ path: "e2e/screenshots/reservations-error.png", fullPage: true });

    failing = false;
    await alert.getByRole("button", { name: "Retry", exact: true }).click();

    await expect(mockedPage.getByText("Alice Johnson")).toBeVisible();
    await expect(alert).toHaveCount(0);
    await expect(mockedPage.getByRole("group", { name: "Total", exact: true })).toHaveText(
      /^Total\s*4$/
    );
    await expect(mockedPage.getByRole("group", { name: /unavailable/ })).toHaveCount(0);
    await expect(
      mockedPage.getByRole("status").filter({ hasText: /^Reservations for .* loaded\.$/ })
    ).toBeVisible();
    await expect(
      mockedPage.getByRole("heading", { name: "Reservations", exact: true })
    ).toBeFocused();
  });
});
