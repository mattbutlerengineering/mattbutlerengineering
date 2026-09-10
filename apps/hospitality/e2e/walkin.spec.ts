import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

/** ux.md Screen 3: after a failure the dialog is back at rest — Seat now enabled — within a second. */
const RESTING_DEADLINE_MS = 1_000;
const SERVER_ERROR_BODY = '{"error":"server error"}';

test.describe("CF-3: Walk-in creation", () => {
  test("opens walk-in dialog and lists available tables", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    // Click "Walk-In" button
    await mockedPage.getByRole("button", { name: /Walk.?In/i }).click();

    // Dialog opens
    const dialog = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
    await expect(dialog).toBeVisible();

    // Party size buttons are visible (WalkInDialog uses buttons, not a text input)
    await expect(dialog.getByRole("button", { name: "4" })).toBeVisible();

    // Table select is visible
    await expect(dialog.getByLabel(/table/i)).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/walkin-dialog.png", fullPage: true });
  });

  test("creates walk-in and verifies timeline update", async ({ mockedPage }) => {
    await mockedPage.goto("timeline");

    // Capture reservation count before walk-in creation. Wait for the grid to
    // render its seeded reservations first — counting before they mount yields
    // 0, then the post-create assertion fails (expected 1, got fixtures + 1).
    const reservationBlocks = mockedPage.getByTestId(/^reservation-block-/);
    await expect(reservationBlocks.first()).toBeVisible();
    const initialCount = await reservationBlocks.count();

    // Click "Walk-In" button
    await mockedPage.getByRole("button", { name: /Walk.?In/i }).click();

    const dialog = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
    await expect(dialog).toBeVisible();

    // Select party size 4
    await dialog.getByRole("button", { name: "4" }).click();

    // Optionally enter guest name
    const guestNameInput = dialog.getByLabel(/guest name/i);
    const hasGuestNameInput = await guestNameInput.isVisible();
    if (hasGuestNameInput) {
      await guestNameInput.fill("Test Guest");
    }

    // Click "Seat now" (the confirm action in WalkInDialog)
    await dialog.getByRole("button", { name: "Seat now" }).click();

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

    const dialog = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
    await expect(dialog).toBeVisible();

    // Click cancel
    await dialog.getByRole("button", { name: /cancel/i }).click();

    // Dialog closes, no reservation created
    await expect(dialog).not.toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/walkin-cancelled.png", fullPage: true });
  });
});

// Item 15: the dialog owns its failure; the page owns the outcome of a success.
test.describe("Walk-in outcomes: failure stays in the dialog, success lands on the new block", () => {
  test("walk-in 500 → 'Walk-in not seated.' in the dialog, block count unchanged, Seat now resting within 1 s, and a reopen shows no stale error", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/api/v1/reservations/walk-in", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: SERVER_ERROR_BODY })
    );
    await mockedPage.goto("timeline");
    const reservationBlocks = mockedPage.getByTestId(/^reservation-block-/);
    await expect(reservationBlocks.first()).toBeVisible();
    const initialCount = await reservationBlocks.count();

    await mockedPage.getByRole("button", { name: "Walk-in", exact: true }).click();
    const dialog = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
    await expect(dialog).toBeVisible();
    const seatNow = dialog.getByRole("button", { name: "Seat now" });
    await seatNow.click();

    await expect(dialog.getByRole("alert")).toContainText("Walk-in not seated.");
    await expect(seatNow).toBeEnabled({ timeout: RESTING_DEADLINE_MS });
    await expect(dialog).toBeVisible();
    // The page shows nothing of it: no banner, the grid untouched.
    await expect(mockedPage.getByTestId("timeline-grid")).toBeVisible();
    await expect(reservationBlocks).toHaveCount(initialCount);

    await mockedPage.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await mockedPage.getByRole("button", { name: "Walk-in", exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });

  test("walk-in success → the new block is selected, in view and focused; role=status names the party and the table", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("timeline");
    const reservationBlocks = mockedPage.getByTestId(/^reservation-block-/);
    await expect(reservationBlocks.first()).toBeVisible();
    const initialCount = await reservationBlocks.count();

    await mockedPage.getByRole("button", { name: "Walk-in", exact: true }).click();
    const dialog = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/guest name/i).fill("Ada Lovelace");
    await dialog.getByRole("button", { name: "Seat now" }).click();

    await expect(dialog).toHaveCount(0);
    await expect(reservationBlocks).toHaveCount(initialCount + 1);
    const created = reservationBlocks.filter({ hasText: "Ada Lovelace" });
    await expect(created).toHaveAttribute("aria-pressed", "true");
    await expect(created).toBeInViewport();
    await expect(created).toBeFocused();
    await expect(
      mockedPage.getByRole("status").filter({ hasText: "Seated Ada Lovelace" })
    ).toHaveText(/^Seated Ada Lovelace, party of 2, at (Table \d|Bar \d)\.$/);
  });
});
