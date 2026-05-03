import { test, expect } from "./fixtures.js";

test.describe("CF-6: Reservations page with filtering", () => {
  test("page loads with header and stats row", async ({ authPage }) => {
    await authPage.goto("/reservations");

    await expect(authPage.getByRole("heading", { name: "Reservations" })).toBeVisible();

    const statsRow = authPage.locator('[role="status"]').first();
    await expect(statsRow).toBeVisible();
  });

  test("displays status filter segments and search input", async ({ authPage }) => {
    await authPage.goto("/reservations");

    await expect(authPage.getByRole("radio", { name: "All" })).toBeVisible();
    await expect(authPage.getByRole("radio", { name: "Confirmed" })).toBeVisible();
    await expect(authPage.getByRole("radio", { name: "Pending" })).toBeVisible();
    await expect(authPage.getByRole("radio", { name: "Cancelled" })).toBeVisible();

    const searchInput = authPage.getByRole("textbox");
    await expect(searchInput).toBeVisible();
  });

  test("status filter updates list when Confirmed is selected", async ({ authPage }) => {
    await authPage.goto("/reservations");

    await authPage.getByRole("radio", { name: "Confirmed" }).click();

    await expect(authPage).toHaveURL(/status=CONFIRMED/);
  });

  test("search input filters the reservation list", async ({ authPage }) => {
    await authPage.goto("/reservations");

    const searchInput = authPage.getByRole("textbox");
    await searchInput.fill("Test");

    const resultCount = authPage.locator('[aria-live="polite"]', { hasText: /reservation/ }).last();
    await expect(resultCount).toBeVisible();
  });

  test("All filter clears status selection", async ({ authPage }) => {
    await authPage.goto("/reservations?status=CONFIRMED");

    await authPage.getByRole("radio", { name: "All" }).click();

    await expect(authPage).not.toHaveURL(/status=CONFIRMED/);
  });

  test("shows empty state when no results match search", async ({ authPage }) => {
    await authPage.goto("/reservations");

    const searchInput = authPage.getByRole("textbox");
    await searchInput.fill("zzzzz-no-match-9999");

    await expect(authPage.getByText("No reservations")).toBeVisible();
  });
});
