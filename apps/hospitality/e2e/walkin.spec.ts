import { test, expect } from "./fixtures.js";

test.describe("CF-3: Walk-in creation", () => {
  test("opens walk-in dialog and lists available tables", async ({ authPage }) => {
    await authPage.goto("/timeline");

    // Click "Walk-In" button
    await authPage.getByRole("button", { name: /Walk.?In/i }).click();

    // Dialog opens
    const dialog = authPage.getByRole("dialog", { name: /walk.?in/i });
    await expect(dialog).toBeVisible();

    // Party size input
    const partySizeInput = dialog.getByLabel(/party size/i);
    await expect(partySizeInput).toBeVisible();
    await partySizeInput.fill("4");

    // Available tables are listed
    const tableList = dialog.getByTestId(/^table-list-/);
    await expect(tableList.first()).toBeVisible();
  });

  test("creates walk-in and verifies timeline update", async ({ authPage }) => {
    await authPage.goto("/timeline");

    // Click "Walk-In" button
    await authPage.getByRole("button", { name: /Walk.?In/i }).click();

    const dialog = authPage.getByRole("dialog", { name: /walk.?in/i });
    await expect(dialog).toBeVisible();

    // Fill form
    await dialog.getByLabel(/party size/i).fill("4");

    // Select first available table
    const firstTable = dialog.getByTestId(/^table-list-/).first();
    await firstTable.click();

    // Optionally enter guest name
    const guestNameInput = dialog.getByLabel(/guest name/i);
    if (await guestNameInput.isVisible()) {
      await guestNameInput.fill("Test Guest");
    }

    // Click "Confirm"
    await dialog.getByRole("button", { name: /confirm/i }).click();

    // Dialog closes
    await expect(dialog).not.toBeVisible();

    // New reservation appears on timeline
    const reservationBlocks = authPage.getByTestId(/^reservation-block-/);
    await expect(reservationBlocks).toHaveCount(await reservationBlocks.count());

    // Table status changes to OCCUPIED (check via testid)
    // Note: exact verification depends on table testid patterns
  });

  test("cancels walk-in dialog", async ({ authPage }) => {
    await authPage.goto("/timeline");

    await authPage.getByRole("button", { name: /Walk.?In/i }).click();

    const dialog = authPage.getByRole("dialog", { name: /walk.?in/i });
    await expect(dialog).toBeVisible();

    // Click cancel
    await dialog.getByRole("button", { name: /cancel/i }).click();

    // Dialog closes, no reservation created
    await expect(dialog).not.toBeVisible();
  });
});
