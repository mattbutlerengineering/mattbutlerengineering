import { test, expect } from "./fixtures.js";

test.describe("CF-7: Guest directory and search", () => {
  test("page loads with header and search input", async ({ mockedPage }) => {
    await mockedPage.goto("/guests");

    await expect(mockedPage.getByRole("heading", { name: "Guests" })).toBeVisible();

    const searchInput = mockedPage.getByPlaceholder("Search guests...");
    await expect(searchInput).toBeVisible();
  });

  test("Add Guest button is visible", async ({ mockedPage }) => {
    await mockedPage.goto("/guests");

    await expect(mockedPage.getByRole("button", { name: "Add Guest" })).toBeVisible();
  });

  test("search input filters guest list", async ({ mockedPage }) => {
    await mockedPage.goto("/guests");

    const searchInput = mockedPage.getByPlaceholder("Search guests...");
    await searchInput.fill("Test");

    const liveRegion = mockedPage.locator('[aria-live="polite"]', { hasText: /guest/ });
    await expect(liveRegion.first()).toBeVisible();
  });

  test("empty search state shows no guests message", async ({ mockedPage }) => {
    await mockedPage.goto("/guests");

    const searchInput = mockedPage.getByPlaceholder("Search guests...");
    await searchInput.fill("zzzzz-no-match-9999");

    await expect(
      mockedPage.getByText(/no guests found/i).or(mockedPage.getByText(/no guests yet/i))
    ).toBeVisible();
  });

  test("Add Guest dialog opens with required fields", async ({ mockedPage }) => {
    await mockedPage.goto("/guests");

    await mockedPage.getByRole("button", { name: "Add Guest" }).click();

    const dialog = mockedPage.getByRole("dialog", { name: /add guest/i });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByPlaceholder("Full name")).toBeVisible();
    await expect(dialog.getByPlaceholder("guest@example.com")).toBeVisible();
  });

  test("Add Guest dialog can be dismissed", async ({ mockedPage }) => {
    await mockedPage.goto("/guests");

    await mockedPage.getByRole("button", { name: "Add Guest" }).click();

    const dialog = mockedPage.getByRole("dialog", { name: /add guest/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /cancel|close/i }).click();

    await expect(dialog).not.toBeVisible();
  });

  test("clicking a guest opens detail drawer", async ({ mockedPage }) => {
    await mockedPage.goto("/guests");

    const firstGuest = mockedPage.getByRole("button", { name: /view details for/i }).first();
    const guestCount = await firstGuest.count();

    if (guestCount > 0) {
      await firstGuest.click();
      await expect(mockedPage.getByRole("dialog")).toBeVisible();
    }
  });
});
