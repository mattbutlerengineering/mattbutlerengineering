import type { Page, Request } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { localDay } from "./local-day.js";

// #8004 / #8010 / #8017: on a phone the reservation details are a Rialto Drawer (overlay above the
// page); at tablet width they are a bottom-sheet Drawer. Cancel, Mark No-Show and Walk-in open
// dialogs while the drawer is still open, so the dialogs must stack above it, and dismissing one
// must leave focus inside the drawer rather than on the grid block behind it.
test.use({ viewport: { width: 375, height: 812 } });

// Bob Smith (res_e2e_002) is PENDING, which offers Cancel; Carol Davis (res_e2e_003) is CONFIRMED,
// the only status that offers Mark No-Show.
async function openDetailsDrawer(page: Page, reservationId: string, drawerName: string) {
  await page.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
  await page.goto("timeline");
  await page.getByTestId(`reservation-block-${reservationId}`).click();
  await expect(page.getByRole("dialog", { name: drawerName })).toBeVisible();
}

const openPhoneDrawer = (page: Page, reservationId: string) =>
  openDetailsDrawer(page, reservationId, "Reservation Details");

const isReservationPatch = (request: Request, id: string, status: string) =>
  request.method() === "PATCH" &&
  request.url().endsWith(`/reservations/${id}`) &&
  (request.postData() ?? "").includes(status);

test.describe("Timeline phone drawer dialogs (#8004)", () => {
  test("Cancel Reservation dialog is clickable above the details drawer", async ({
    mockedPage,
  }) => {
    await openPhoneDrawer(mockedPage, "res_e2e_002");
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

  test("confirming Cancel Reservation sends the PATCH and closes the drawer", async ({
    mockedPage,
  }) => {
    await openPhoneDrawer(mockedPage, "res_e2e_002");
    await mockedPage.getByRole("button", { name: "Cancel Reservation", exact: true }).click();
    const dialog = mockedPage.getByRole("dialog", { name: "Cancel Reservation" });

    const sent = mockedPage.waitForRequest((r) =>
      isReservationPatch(r, "res_e2e_002", "CANCELLED")
    );
    await dialog
      .getByRole("button", { name: "Cancel Reservation", exact: true })
      .click({ timeout: 3000 });
    await sent;

    await expect(dialog).toHaveCount(0);
    await expect(mockedPage.getByRole("dialog", { name: "Reservation Details" })).toHaveCount(0);
  });

  test("Mark No-Show dialog is clickable above the details drawer", async ({ mockedPage }) => {
    await openPhoneDrawer(mockedPage, "res_e2e_003");
    await mockedPage.getByRole("button", { name: "Mark No-Show", exact: true }).click();

    const dialog = mockedPage.getByRole("dialog", { name: "Mark No-Show" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep Reservation" }).click({ timeout: 3000 });
    await expect(dialog).toHaveCount(0);
  });

  test("confirming Mark No-Show sends the PATCH and closes the drawer", async ({ mockedPage }) => {
    await openPhoneDrawer(mockedPage, "res_e2e_003");
    await mockedPage.getByRole("button", { name: "Mark No-Show", exact: true }).click();
    const dialog = mockedPage.getByRole("dialog", { name: "Mark No-Show" });

    const sent = mockedPage.waitForRequest((r) => isReservationPatch(r, "res_e2e_003", "NO_SHOW"));
    await dialog
      .getByRole("button", { name: "Mark No-Show", exact: true })
      .click({ timeout: 3000 });
    await sent;

    await expect(dialog).toHaveCount(0);
    await expect(mockedPage.getByRole("dialog", { name: "Reservation Details" })).toHaveCount(0);
  });
});

// #8010: the command palette (z-index 9999) opens the walk-in dialog over the open drawer.
test.describe("Walk-in dialog over the details drawer (#8010)", () => {
  async function openWalkInOverDrawer(page: Page) {
    await openPhoneDrawer(page, "res_e2e_002");
    // Lowercase key: the palette compares `e.key === "k"`, which "Meta+K" would not send. The
    // choice is made from the keyboard; the palette's own layering is #7996's, not this spec's.
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Command palette", exact: true });
    await palette.getByRole("combobox", { name: "Search commands", exact: true }).fill("walk");
    await expect(palette.getByRole("option", { name: "Walk-in guest", exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Seat walk-in" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("party size and Cancel take clicks", async ({ mockedPage }) => {
    const dialog = await openWalkInOverDrawer(mockedPage);
    const four = dialog.getByRole("button", { name: "4", exact: true });
    await four.click({ timeout: 3000 });
    await expect(four).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click({ timeout: 3000 });
    await expect(dialog).toHaveCount(0);
  });

  test("Seat now posts the walk-in", async ({ mockedPage }) => {
    const dialog = await openWalkInOverDrawer(mockedPage);
    const sent = mockedPage.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/reservations/walk-in")
    );
    await dialog.getByRole("button", { name: "Seat now" }).click({ timeout: 3000 });
    await sent;
    await expect(dialog).toHaveCount(0);
  });
});

// #8017: Keep and Escape leave the drawer open, so focus goes back to the button that opened the
// dialog, not to the grid block behind the drawer's modal overlay.
test.describe("Focus after dismissing a drawer dialog (#8017)", () => {
  const dialogs = [
    { id: "res_e2e_002", opener: "Cancel Reservation", dialog: "Cancel Reservation" },
    { id: "res_e2e_003", opener: "Mark No-Show", dialog: "Mark No-Show" },
  ];

  for (const { id, opener, dialog: dialogName } of dialogs) {
    for (const how of ["Keep", "Escape"] as const) {
      test(`${dialogName}: ${how} returns focus to ${opener} in the drawer`, async ({
        mockedPage,
      }) => {
        await openPhoneDrawer(mockedPage, id);
        const openerButton = mockedPage
          .getByRole("dialog", { name: "Reservation Details" })
          .getByRole("button", { name: opener, exact: true });
        await openerButton.click();
        const dialog = mockedPage.getByRole("dialog", { name: dialogName });
        await expect(dialog).toBeVisible();

        if (how === "Keep") {
          await dialog.getByRole("button", { name: "Keep Reservation" }).click();
        } else {
          await mockedPage.keyboard.press("Escape");
        }

        await expect(dialog).toHaveCount(0);
        await expect(mockedPage.getByRole("dialog", { name: "Reservation Details" })).toBeVisible();
        await expect(openerButton).toBeFocused();
      });
    }
  }

  test.describe("at tablet width", () => {
    test.use({ viewport: { width: 900, height: 1100 } });

    test("Keep, then ArrowRight and Enter, does not switch the sheet", async ({ mockedPage }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", "Bob Smith");
      const sheet = mockedPage.getByRole("dialog", { name: "Bob Smith" });
      const openerButton = sheet.getByRole("button", { name: "Cancel reservation", exact: true });
      await openerButton.click();
      await mockedPage
        .getByRole("dialog", { name: "Cancel Reservation" })
        .getByRole("button", { name: "Keep Reservation" })
        .click();

      await expect(openerButton).toBeFocused();
      await mockedPage.keyboard.press("ArrowRight");
      await mockedPage.keyboard.press("Enter");

      // Still Bob's sheet (Enter on the focused Cancel button only reopens its dialog).
      await expect(mockedPage.getByRole("dialog", { name: "Bob Smith" })).toBeVisible();
      await expect(mockedPage.getByRole("dialog", { name: "Carol Davis" })).toHaveCount(0);
    });
  });
});
