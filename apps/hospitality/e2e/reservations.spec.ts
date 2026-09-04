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

// A6.2's second clause (architecture § Amendment 2026-09-04): the palette's "New Reservation"
// carries an intent in the URL — `/reservations?new=true` — and the page opens its dialog from
// the URL, then strips the key so Back or a reload does not replay it (A6.1's rule by mirror).
test.describe("⌘K → New Reservation opens the dialog via /reservations?new=true", () => {
  test("⌘K, 'new res', ⏎ lands on /reservations with the New Reservation dialog open and focus inside; Escape leaves no `new` in the URL", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("reservations");
    await expect(
      mockedPage.getByRole("heading", { name: "Reservations", exact: true })
    ).toBeVisible();

    // rialto CommandPalette: role="dialog" "Command palette", role="combobox" "Search commands";
    // the shortcut accepts meta or ctrl, so the platform-resolving modifier is exact on either OS.
    // Open via the shortcut, NOT the sidebar's "Open command palette" hint button: the palette's
    // useReturnFocus restores whatever was focused at open in a rAF *after* the New Reservation
    // dialog's trap has taken focus — with nothing focused (body) that restore is a no-op; a
    // focused hint button would yank focus back out of the dialog and the `:focus` check below
    // would count 0.
    await mockedPage.keyboard.press("ControlOrMeta+k");
    const palette = mockedPage.getByRole("dialog", { name: "Command palette", exact: true });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox", { name: "Search commands", exact: true }).fill("new res");
    await expect(
      palette.getByRole("option", { name: "New Reservation", exact: true })
    ).toBeVisible();
    await mockedPage.keyboard.press("Enter");

    await expect(mockedPage).toHaveURL(/\/hospitality\/reservations\?(?:[^#]*&)?new=true(?:&|$)/);
    const dialog = mockedPage.getByRole("dialog", { name: "New Reservation", exact: true });
    await expect(dialog).toBeVisible();
    // Focus is inside the dialog (its trap took it), not left on the palette's unmounted input.
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await mockedPage.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // The lookahead guards a leading `new=` too (`\?` has already consumed the `?`, so an
    // `[?&]new=` form would let `?new=true` through); the second assertion is the plain restatement.
    await expect(mockedPage).toHaveURL(/\/hospitality\/reservations(?:\?(?!(?:.*&)?new=).*)?$/);
    await expect(mockedPage).not.toHaveURL(/[?&]new=/);
  });
});
