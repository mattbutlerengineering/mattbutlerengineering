import { test, expect } from "./fixtures.js";

test.describe("CF-7: Guest directory and search", () => {
  test("page loads with header and search input", async ({ authPage }) => {
    await authPage.goto("/guests");

    await expect(authPage.getByRole("heading", { name: "Guests" })).toBeVisible();

    const searchInput = authPage.getByPlaceholder("Search guests...");
    await expect(searchInput).toBeVisible();
  });

  test("Add Guest button is visible", async ({ authPage }) => {
    await authPage.goto("/guests");

    await expect(authPage.getByRole("button", { name: "Add Guest" })).toBeVisible();
  });

  test("search input filters guest list", async ({ authPage }) => {
    await authPage.goto("/guests");

    const searchInput = authPage.getByPlaceholder("Search guests...");
    await searchInput.fill("Test");

    const liveRegion = authPage.locator('[aria-live="polite"]', { hasText: /guest/ });
    await expect(liveRegion.first()).toBeVisible();
  });

  test("empty search state shows no guests message", async ({ authPage }) => {
    await authPage.goto("/guests");

    const searchInput = authPage.getByPlaceholder("Search guests...");
    await searchInput.fill("zzzzz-no-match-9999");

    await expect(
      authPage.getByText(/no guests found/i).or(authPage.getByText(/no guests yet/i))
    ).toBeVisible();
  });

  test("Add Guest dialog opens with required fields", async ({ authPage }) => {
    await authPage.goto("/guests");

    await authPage.getByRole("button", { name: "Add Guest" }).click();

    const dialog = authPage.getByRole("dialog", { name: /add guest/i });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByPlaceholder("Full name")).toBeVisible();
    await expect(dialog.getByPlaceholder("guest@example.com")).toBeVisible();
  });

  test("Add Guest dialog can be dismissed", async ({ authPage }) => {
    await authPage.goto("/guests");

    await authPage.getByRole("button", { name: "Add Guest" }).click();

    const dialog = authPage.getByRole("dialog", { name: /add guest/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /cancel|close/i }).click();

    await expect(dialog).not.toBeVisible();
  });

  test("clicking a guest opens detail drawer", async ({ authPage }) => {
    await authPage.goto("/guests");

    const firstGuest = authPage.getByRole("button", { name: /view details for/i }).first();
    const guestCount = await firstGuest.count();

    if (guestCount > 0) {
      await firstGuest.click();
      await expect(authPage.getByRole("dialog")).toBeVisible();
    }
  });
});
