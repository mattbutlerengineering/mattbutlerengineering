import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-6: Reservations page with filtering", () => {
  test("page loads with header and stats row", async ({ mockedPage }) => {
    await mockedPage.goto("/reservations");

    await expect(mockedPage.getByRole("heading", { name: "Reservations" })).toBeVisible();

    const statsRow = mockedPage.locator('[role="status"]').first();
    await expect(statsRow).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/reservations-list.png", fullPage: true });
  });

  test("displays status filter segments and search input", async ({ mockedPage }) => {
    await mockedPage.goto("/reservations");

    await expect(mockedPage.getByRole("radio", { name: "All" })).toBeVisible();
    await expect(mockedPage.getByRole("radio", { name: "Confirmed" })).toBeVisible();
    await expect(mockedPage.getByRole("radio", { name: "Pending" })).toBeVisible();
    await expect(mockedPage.getByRole("radio", { name: "Cancelled" })).toBeVisible();

    const searchInput = mockedPage.getByRole("textbox");
    await expect(searchInput).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/reservations-filters.png",
      fullPage: true,
    });
  });

  test("status filter updates list when Confirmed is selected", async ({ mockedPage }) => {
    await mockedPage.goto("/reservations");

    await mockedPage.getByRole("radio", { name: "Confirmed" }).click();

    await expect(mockedPage).toHaveURL(/status=CONFIRMED/);
  });

  test("search input filters the reservation list", async ({ mockedPage }) => {
    await mockedPage.goto("/reservations");

    const searchInput = mockedPage.getByRole("textbox");
    await searchInput.fill("Test");

    const resultCount = mockedPage
      .locator('[aria-live="polite"]', { hasText: /reservation/ })
      .last();
    await expect(resultCount).toBeVisible();
  });

  test("All filter clears status selection", async ({ mockedPage }) => {
    await mockedPage.goto("/reservations?status=CONFIRMED");

    await mockedPage.getByRole("radio", { name: "All" }).click();

    await expect(mockedPage).not.toHaveURL(/status=CONFIRMED/);
  });

  test("shows empty state when no results match search", async ({ mockedPage }) => {
    await mockedPage.goto("/reservations");

    const searchInput = mockedPage.getByRole("textbox");
    await searchInput.fill("zzzzz-no-match-9999");

    await expect(mockedPage.getByText("No reservations")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/reservations-empty.png", fullPage: true });
  });
});
