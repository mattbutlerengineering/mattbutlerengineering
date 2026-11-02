import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { localDay } from "./local-day.js";

// #8046: Seat now over Bob's open details surface opens the walk-in's surface. Escape on it must
// land focus on the walk-in's block, the party whose surface was just closed, never Bob's.
// #8098: so must Cancel (phone) and Mark No-Show (tablet), which close through their own path.
const PHONE = { label: "phone", size: { width: 375, height: 812 }, surface: "Reservation Details" };
const TABLET = { label: "tablet", size: { width: 900, height: 1100 }, surface: "Bob Smith" };
const VIEWPORTS = [PHONE, TABLET];

const WALK_IN_BLOCK = '[data-testid^="reservation-block-res_e2e_walkin_"]';
const MODAL = '[role="dialog"][aria-modal="true"]';

/** Opens Bob's details, then Seat now from the palette: the walk-in's surface is up over Bob's. */
async function seatWalkInOverBob(page: Page, { size, surface }: typeof PHONE) {
  await page.setViewportSize(size);
  await page.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
  await page.goto("timeline");
  await page.getByTestId("reservation-block-res_e2e_002").click();
  await expect(page.getByRole("dialog", { name: surface })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page
    .getByRole("dialog", { name: "Command palette", exact: true })
    .getByRole("combobox", { name: "Search commands", exact: true })
    .fill("walk");
  await page.keyboard.press("Enter");
  const walkIn = page.getByRole("dialog", { name: "Seat walk-in" });
  await walkIn.getByRole("button", { name: "Seat now" }).click();
  await expect(walkIn).toHaveCount(0);
  await expect(page.locator(`${MODAL} :focus`)).toHaveCount(1);
}

async function settleAfterClose(page: Page) {
  await expect(page.locator(MODAL)).toHaveCount(0);
  // Past the closed surface's own focus restore, which would otherwise undo an earlier landing.
  await page.waitForTimeout(500);
}

for (const viewport of VIEWPORTS) {
  test(`Escape after Seat now lands on the walk-in's block at ${viewport.label} width (#8046)`, async ({
    mockedPage,
  }) => {
    await seatWalkInOverBob(mockedPage, viewport);

    await mockedPage.keyboard.press("Escape");

    await settleAfterClose(mockedPage);
    await expect(mockedPage.locator(WALK_IN_BLOCK)).toBeFocused();
    await expect(mockedPage.getByTestId("reservation-block-res_e2e_002")).not.toBeFocused();
  });
}

test("Cancel after Seat now lands on the walk-in's block at phone width (#8098)", async ({
  mockedPage,
}) => {
  await seatWalkInOverBob(mockedPage, PHONE);
  await mockedPage.getByRole("button", { name: "Cancel Reservation", exact: true }).click();
  const dialog = mockedPage.getByRole("dialog", { name: "Cancel Reservation" });
  await dialog.getByRole("button", { name: "Cancel Reservation", exact: true }).click();

  await settleAfterClose(mockedPage);
  await expect(mockedPage.locator(WALK_IN_BLOCK)).toBeFocused();
  await expect(mockedPage.getByTestId("reservation-block-res_e2e_002")).not.toBeFocused();
});

test("Mark No-Show after Seat now lands on the walk-in's block at tablet width (#8098)", async ({
  mockedPage,
}) => {
  await seatWalkInOverBob(mockedPage, TABLET);
  await mockedPage.getByRole("button", { name: "Mark No-Show", exact: true }).click();
  const dialog = mockedPage.getByRole("dialog", { name: "Mark No-Show" });
  await dialog.getByRole("button", { name: "Mark No-Show", exact: true }).click();

  await settleAfterClose(mockedPage);
  await expect(mockedPage.locator(WALK_IN_BLOCK)).toBeFocused();
  await expect(mockedPage.getByTestId("reservation-block-res_e2e_002")).not.toBeFocused();
});
