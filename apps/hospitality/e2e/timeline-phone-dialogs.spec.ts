import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { localDay } from "./local-day.js";

// #8004: on a phone the reservation details are a Rialto Drawer (overlay above the page). Cancel
// and Mark No-Show open their confirm dialogs while the drawer is still open, so the dialogs must
// stack above the drawer or staff cannot confirm anything.
test.use({ viewport: { width: 375, height: 812 } });

// Bob Smith (res_e2e_002) is PENDING, which offers Cancel; Carol Davis (res_e2e_003) is CONFIRMED,
// the only status that offers Mark No-Show.
async function openDetailsDrawer(page: Page, reservationId: string) {
  await page.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
  await page.goto("timeline");
  await page.getByTestId(`reservation-block-${reservationId}`).click();
  await expect(page.getByRole("dialog", { name: "Reservation Details" })).toBeVisible();
}

test.describe("Timeline phone drawer dialogs (#8004)", () => {
  test("Cancel Reservation dialog is clickable above the details drawer", async ({
    mockedPage,
  }) => {
    await openDetailsDrawer(mockedPage, "res_e2e_002");
    await mockedPage.getByRole("button", { name: "Cancel Reservation", exact: true }).click();

    const dialog = mockedPage.getByRole("dialog", { name: "Cancel Reservation" });
    await expect(dialog).toBeVisible();
    // The Reason menu is portaled; it must still open above the dialog.
    await dialog.getByRole("combobox").click();
    await mockedPage.getByRole("option", { name: "Restaurant Cancelled" }).click({ timeout: 3000 });
    // A real pointer click: Playwright fails if another element (the drawer overlay) intercepts it.
    await dialog.getByRole("button", { name: "Keep Reservation" }).click({ timeout: 3000 });
    await expect(dialog).toHaveCount(0);
  });

  test("Mark No-Show dialog is clickable above the details drawer", async ({ mockedPage }) => {
    await openDetailsDrawer(mockedPage, "res_e2e_003");
    await mockedPage.getByRole("button", { name: "Mark No-Show", exact: true }).click();

    const dialog = mockedPage.getByRole("dialog", { name: "Mark No-Show" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep Reservation" }).click({ timeout: 3000 });
    await expect(dialog).toHaveCount(0);
  });
});
