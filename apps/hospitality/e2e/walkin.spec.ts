import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-3: Walk-in creation", () => {
  test("opens walk-in dialog and lists available tables", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    // Click "Walk-In" button
    await mockedPage.getByRole("button", { name: /Walk.?In/i }).click();

    // Dialog opens
    const dialog = mockedPage.getByRole("dialog", { name: /walk.?in/i });
    await expect(dialog).toBeVisible();

    // Party size buttons are visible (WalkInDialog uses buttons, not a text input)
    await expect(dialog.getByRole("button", { name: "4" })).toBeVisible();

    // Table select is visible
    await expect(dialog.getByLabel(/table/i)).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/walkin-dialog.png", fullPage: true });
  });

  test("creates walk-in and verifies timeline update", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    // Capture reservation count before walk-in creation
    const reservationBlocks = mockedPage.getByTestId(/^reservation-block-/);
    const initialCount = await reservationBlocks.count();

    // Click "Walk-In" button
    await mockedPage.getByRole("button", { name: /Walk.?In/i }).click();

    const dialog = mockedPage.getByRole("dialog", { name: /walk.?in/i });
    await expect(dialog).toBeVisible();

    // Select party size 4
    await dialog.getByRole("button", { name: "4" }).click();

    // Optionally enter guest name
    const guestNameInput = dialog.getByLabel(/guest name/i);
    const hasGuestNameInput = await guestNameInput.isVisible();
    if (hasGuestNameInput) {
      await guestNameInput.fill("Test Guest");
    }

    // Click "Seat Now" (the confirm action in WalkInDialog)
    await dialog.getByRole("button", { name: /seat now/i }).click();

    // Dialog closes
    await expect(dialog).not.toBeVisible();

    // New reservation block appears on timeline (count increased by 1)
    await expect(reservationBlocks).toHaveCount(initialCount + 1);

    // When guest name was entered, verify the walk-in block shows the guest name
    if (hasGuestNameInput) {
      await expect(
        mockedPage.getByTestId(/^reservation-block-/).filter({ hasText: "Test Guest" })
      ).toBeVisible();
    }
  });

  test("cancels walk-in dialog", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    await mockedPage.getByRole("button", { name: /Walk.?In/i }).click();

    const dialog = mockedPage.getByRole("dialog", { name: /walk.?in/i });
    await expect(dialog).toBeVisible();

    // Click cancel
    await dialog.getByRole("button", { name: /cancel/i }).click();

    // Dialog closes, no reservation created
    await expect(dialog).not.toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/walkin-cancelled.png", fullPage: true });
  });
});
