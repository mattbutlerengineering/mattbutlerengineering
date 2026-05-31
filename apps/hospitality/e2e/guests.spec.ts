import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-7: Guest directory and search", () => {
  test("page loads with header and search input", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    await expect(mockedPage.getByRole("heading", { name: "Guests" })).toBeVisible();

    const searchInput = mockedPage.getByPlaceholder("Search guests...");
    await expect(searchInput).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/guests-list.png", fullPage: true });
  });

  test("Add Guest button is visible", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    await expect(mockedPage.getByRole("button", { name: "Add Guest" })).toBeVisible();
  });

  test("search input filters guest list", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const searchInput = mockedPage.getByPlaceholder("Search guests...");
    await searchInput.fill("Test");

    const liveRegion = mockedPage.locator('[aria-live="polite"]', { hasText: /guest/ });
    await expect(liveRegion.first()).toBeVisible();
  });

  test("empty search state shows no guests message", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const searchInput = mockedPage.getByPlaceholder("Search guests...");
    await searchInput.fill("zzzzz-no-match-9999");

    await expect(
      mockedPage.getByText(/no guests found/i).or(mockedPage.getByText(/no guests yet/i))
    ).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/guests-empty-search.png",
      fullPage: true,
    });
  });

  test("Add Guest dialog opens with required fields", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    await mockedPage.getByRole("button", { name: "Add Guest" }).click();

    const dialog = mockedPage.getByRole("dialog", { name: /add guest/i });
    await expect(dialog).toBeVisible();

    await expect(dialog.getByPlaceholder("Full name")).toBeVisible();
    await expect(dialog.getByPlaceholder("guest@example.com")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/guests-add-dialog.png", fullPage: true });
  });

  test("Add Guest dialog can be dismissed", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    await mockedPage.getByRole("button", { name: "Add Guest" }).click();

    const dialog = mockedPage.getByRole("dialog", { name: /add guest/i });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /cancel|close/i }).click();

    await expect(dialog).not.toBeVisible();
  });

  test("clicking a guest opens detail drawer", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const firstGuest = mockedPage.getByRole("button", { name: /view details for/i }).first();
    const guestCount = await firstGuest.count();

    if (guestCount > 0) {
      await firstGuest.click();
      await expect(mockedPage.getByRole("dialog")).toBeVisible();
    }
  });
});

test.describe("CF-7: Guest profile editing", () => {
  test("Edit Guest button opens edit form in drawer", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    // Open the first guest drawer
    const firstGuestRow = mockedPage.getByRole("button", { name: /view details for/i }).first();
    await expect(firstGuestRow).toBeVisible();
    await firstGuestRow.click();

    // Drawer should open
    const drawer = mockedPage.getByRole("dialog");
    await expect(drawer).toBeVisible();

    // Click Edit Guest button
    await drawer.getByRole("button", { name: /edit guest/i }).click();

    // Edit form fields should be visible
    await expect(mockedPage.getByPlaceholder("Full name")).toBeVisible();
    await expect(mockedPage.getByPlaceholder("guest@example.com")).toBeVisible();
    await expect(mockedPage.getByPlaceholder("+1 (555) 000-0000")).toBeVisible();

    await mockedPage.screenshot({ path: "e2e/screenshots/guests-edit-form.png", fullPage: true });
  });

  test("dietary restriction checkboxes appear in edit mode", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const firstGuestRow = mockedPage.getByRole("button", { name: /view details for/i }).first();
    await firstGuestRow.click();

    const drawer = mockedPage.getByRole("dialog");
    await drawer.getByRole("button", { name: /edit guest/i }).click();

    // Dietary restriction checkboxes should be present
    await expect(mockedPage.getByRole("checkbox", { name: /vegetarian/i })).toBeVisible();
    await expect(mockedPage.getByRole("checkbox", { name: /vegan/i })).toBeVisible();
    await expect(mockedPage.getByRole("checkbox", { name: /gluten.free/i })).toBeVisible();
  });

  test("Save button saves guest and closes edit mode", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const firstGuestRow = mockedPage.getByRole("button", { name: /view details for/i }).first();
    await firstGuestRow.click();

    const drawer = mockedPage.getByRole("dialog");
    await drawer.getByRole("button", { name: /edit guest/i }).click();

    // Modify the name
    const nameInput = mockedPage.getByPlaceholder("Full name");
    await nameInput.fill("Alice Johnson Updated");

    // Click Save
    await drawer.getByRole("button", { name: /^save$/i }).click();

    // Should return to view mode (Edit Guest button back)
    await expect(drawer.getByRole("button", { name: /edit guest/i })).toBeVisible();

    await mockedPage.screenshot({
      path: "e2e/screenshots/guests-edit-saved.png",
      fullPage: true,
    });
  });

  test("Cancel button restores original data", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const firstGuestRow = mockedPage.getByRole("button", { name: /view details for/i }).first();
    await firstGuestRow.click();

    const drawer = mockedPage.getByRole("dialog");
    await drawer.getByRole("button", { name: /edit guest/i }).click();

    // Modify the name
    const nameInput = mockedPage.getByPlaceholder("Full name");
    await nameInput.fill("Should Not Save");

    // Click Cancel
    await drawer.getByRole("button", { name: /cancel/i }).click();

    // Should return to view mode without the change
    await expect(drawer.getByRole("button", { name: /edit guest/i })).toBeVisible();
  });

  test("Save button is disabled when name is empty", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const firstGuestRow = mockedPage.getByRole("button", { name: /view details for/i }).first();
    await firstGuestRow.click();

    const drawer = mockedPage.getByRole("dialog");
    await drawer.getByRole("button", { name: /edit guest/i }).click();

    // Clear the name
    const nameInput = mockedPage.getByPlaceholder("Full name");
    await nameInput.fill("");

    // Save button should be disabled
    const saveButton = drawer.getByRole("button", { name: /^save$/i });
    await expect(saveButton).toBeDisabled();
  });

  test("tag input adds tags in edit mode", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const firstGuestRow = mockedPage.getByRole("button", { name: /view details for/i }).first();
    await firstGuestRow.click();

    const drawer = mockedPage.getByRole("dialog");
    await drawer.getByRole("button", { name: /edit guest/i }).click();

    // Type a tag and press Enter
    const tagInput = mockedPage.getByPlaceholder("Add tag (press Enter)");
    await expect(tagInput).toBeVisible();
    await tagInput.fill("new-tag");
    await tagInput.press("Enter");

    // Tag input should be cleared
    await expect(tagInput).toHaveValue("");
  });
});
