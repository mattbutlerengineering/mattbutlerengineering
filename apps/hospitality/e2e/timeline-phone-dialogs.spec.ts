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

// #8010: the command palette (z-index 10001, above the walk-in dialog's 10000 and the drawer's
// 9998/9999) opens the walk-in dialog over the open drawer.
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

// #8018 / #8021: while the details surface is open (a modal Drawer at 375x812 and 900x1100),
// focus must be inside it: on open, after the walk-in dialog closes, and after a walk-in is seated.
// Closing the surface hands focus back to the block that opened it.
const SURFACES = [
  { label: "phone", viewport: { width: 375, height: 812 }, dialog: "Reservation Details" },
  { label: "tablet", viewport: { width: 900, height: 1100 }, dialog: "Bob Smith" },
];

for (const { label, viewport, dialog: surfaceName } of SURFACES) {
  test.describe(`Focus and the details surface at ${label} width (#8018, #8021)`, () => {
    test.use({ viewport });

    const surface = (page: Page) => page.getByRole("dialog", { name: surfaceName });
    const focused = (page: Page) => surface(page).locator(":focus");
    const modalFocus = (page: Page) => page.locator('[role="dialog"][aria-modal="true"] :focus');

    async function openWalkInFromPalette(page: Page) {
      await page.keyboard.press("ControlOrMeta+k");
      const palette = page.getByRole("dialog", { name: "Command palette", exact: true });
      await palette.getByRole("combobox", { name: "Search commands", exact: true }).fill("walk");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Seat walk-in" });
      await expect(dialog).toBeVisible();
      return dialog;
    }

    test("opening the surface moves focus inside it", async ({ mockedPage }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      await expect(focused(mockedPage)).toHaveCount(1);
    });

    test("closing the surface returns focus to the block", async ({ mockedPage }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      await mockedPage.keyboard.press("Escape");
      await expect(surface(mockedPage)).toHaveCount(0);
      await expect(mockedPage.getByTestId("reservation-block-res_e2e_002")).toBeFocused();
    });

    test("Cancel in the walk-in dialog leaves focus inside the surface", async ({ mockedPage }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      const dialog = await openWalkInFromPalette(mockedPage);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(focused(mockedPage)).toHaveCount(1);
    });

    test("Escape in the walk-in dialog leaves focus inside the surface", async ({ mockedPage }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      const dialog = await openWalkInFromPalette(mockedPage);
      await mockedPage.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(focused(mockedPage)).toHaveCount(1);
    });

    test("Seat now leaves focus inside the surface, not on the block behind it", async ({
      mockedPage,
    }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      const dialog = await openWalkInFromPalette(mockedPage);
      await dialog.getByRole("button", { name: "Seat now" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(mockedPage.locator('[role="dialog"][aria-modal="true"] :focus')).toHaveCount(1);
    });

    // The Drawer opens in the commit that unmounts the walk-in dialog, so it captures no live
    // opener: closing it has to find the new block itself.
    test("closing the surface Seat now opened focuses the new block", async ({ mockedPage }) => {
      await mockedPage.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
      await mockedPage.goto("timeline");
      await mockedPage.getByRole("button", { name: "Walk-in", exact: true }).click();
      const dialog = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
      await dialog.getByRole("button", { name: "Seat now" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(modalFocus(mockedPage)).toHaveCount(1);

      await mockedPage.keyboard.press("Escape");

      await expect(mockedPage.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
      await expect(
        mockedPage.locator('[data-testid^="reservation-block-res_e2e_walkin_"]')
      ).toBeFocused();
    });

    test("closing a surface opened from ?selected= focuses that block", async ({ mockedPage }) => {
      await mockedPage.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
      await mockedPage.goto("timeline?selected=res_e2e_002");
      await expect(surface(mockedPage)).toBeVisible();

      await mockedPage.keyboard.press("Escape");

      await expect(surface(mockedPage)).toHaveCount(0);
      await expect(mockedPage.getByTestId("reservation-block-res_e2e_002")).toBeFocused();
    });

    test("Seat Guest leaves focus inside the surface, so keys cannot reach the blocks", async ({
      mockedPage,
    }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      await surface(mockedPage).getByRole("button", { name: "Seat Guest" }).click();
      await expect(mockedPage.getByRole("status")).toContainText("Seated");
      // The refetch removes Seat Guest, so focus must not have settled on it.
      await expect(surface(mockedPage).getByRole("button", { name: "Seat Guest" })).toHaveCount(0);
      await expect(focused(mockedPage)).toHaveCount(1);

      await mockedPage.keyboard.press("ArrowRight");
      await mockedPage.keyboard.press("Enter");

      await expect(surface(mockedPage)).toBeVisible();
      await expect(mockedPage.getByRole("dialog", { name: "Carol Davis" })).toHaveCount(0);
    });

    // A browser whose click does not focus its button: focus rests on the block at the click.
    test("saving an edit opened by a non-focusing click returns focus to Edit", async ({
      mockedPage,
    }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      const edit = surface(mockedPage).getByRole("button", { name: /^Edit/ });
      await mockedPage
        .getByTestId("reservation-block-res_e2e_002")
        .evaluate((block) => (block as HTMLElement).focus());
      await edit.evaluate((button) => (button as HTMLElement).click());
      const drawer = mockedPage.getByRole("dialog", { name: "Edit Reservation" });
      await drawer.getByRole("button", { name: /^Save/ }).click();

      await expect(drawer).toHaveCount(0);
      await expect(edit).toBeFocused();
    });

    test("a reservation without a deposit shows no error alert", async ({ mockedPage }) => {
      await openDetailsDrawer(mockedPage, "res_e2e_002", surfaceName);
      if (label === "tablet") {
        await surface(mockedPage).getByRole("button", { name: /More/ }).click();
      }
      await expect(surface(mockedPage).getByRole("alert")).toHaveCount(0);
    });
  });
}

const DESKTOP = { width: 1280, height: 900 };
const TABLET = { width: 900, height: 1100 };
const PHONE = { width: 375, height: 812 };
const BOB = /\/api\/v1\/reservations\/res_e2e_002$/;

const modalFocus = (page: Page) => page.locator('[role="dialog"][aria-modal="true"] :focus');
const block = (page: Page, id: string) => page.getByTestId(`reservation-block-${id}`);

async function loadTimeline(page: Page) {
  await page.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
  await page.goto("timeline");
}

/** Holds matching requests until `release`, which lets them through or answers with a 500. */
async function holdRequests(page: Page, url: RegExp, method: string) {
  let release: (outcome: "ok" | "fail") => void = () => undefined;
  const gate = new Promise<"ok" | "fail">((resolve) => {
    release = resolve;
  });
  const held: string[] = [];
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    held.push(route.request().url());
    if ((await gate) === "ok") return route.fallback();
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "X", message: "boom" } }),
    });
  });
  return { release: (outcome: "ok" | "fail") => release(outcome), held };
}

/** Every write to a reservation from here on: what a stray key press would send. */
function recordWrites(page: Page) {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/reservations")) {
      writes.push(`${request.method()} ${request.postData()}`);
    }
  });
  return writes;
}

async function openWalkInFromPaletteAt(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog", { name: "Command palette", exact: true });
  await palette.getByRole("combobox", { name: "Search commands", exact: true }).fill("walk");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Seat walk-in" });
  await expect(dialog).toBeVisible();
  return dialog;
}

// #8029 item 3: a dialog open across a resize stays on top of the surface it was opened from. The
// surface beneath it does not change form until the dialog closes, because the sheet or drawer that
// would replace it takes focus and the Escape layer when it mounts.
test.describe("Resizing with a dialog open (#8029)", () => {
  const dialogs = [
    {
      name: "Cancel Reservation",
      id: "res_e2e_002",
      open: (page: Page) =>
        page
          .getByTestId("reservation-detail-sidebar")
          .getByRole("button", { name: "Cancel Reservation", exact: true })
          .click(),
    },
    {
      name: "Mark No-Show",
      id: "res_e2e_003",
      open: (page: Page) =>
        page
          .getByTestId("reservation-detail-sidebar")
          .getByRole("button", { name: "Mark No-Show", exact: true })
          .click(),
    },
    {
      name: "Seat walk-in",
      id: "res_e2e_002",
      open: (page: Page) => page.getByRole("button", { name: "Walk-in", exact: true }).click(),
    },
  ];

  test.describe("from desktop to tablet", () => {
    test.use({ viewport: DESKTOP });

    for (const { name, id, open } of dialogs) {
      test(`Enter under ${name} sends nothing behind it`, async ({ mockedPage }) => {
        await loadTimeline(mockedPage);
        await block(mockedPage, id).click();
        await open(mockedPage);
        const dialog = mockedPage.getByRole("dialog", { name });
        await expect(dialog).toBeVisible();
        const writes = recordWrites(mockedPage);

        await mockedPage.setViewportSize(TABLET);
        await mockedPage.waitForTimeout(500);

        await expect(dialog.locator(":focus")).toHaveCount(1);
        await mockedPage.keyboard.press("Enter");
        await mockedPage.waitForTimeout(300);
        // Enter acts in the dialog (on Mark No-Show its first control is Keep, which closes it).
        expect(writes).toEqual([]);
      });
    }

    test("Escape closes the dialog, then focus lands in the sheet that replaces the sidebar", async ({
      mockedPage,
    }) => {
      await loadTimeline(mockedPage);
      await block(mockedPage, "res_e2e_002").click();
      await dialogs[0]!.open(mockedPage);
      const dialog = mockedPage.getByRole("dialog", { name: "Cancel Reservation" });
      await expect(dialog).toBeVisible();

      await mockedPage.setViewportSize(TABLET);
      await mockedPage.waitForTimeout(500);
      await expect(mockedPage.getByRole("dialog", { name: "Bob Smith" })).toHaveCount(0);
      await mockedPage.keyboard.press("Escape");

      await expect(dialog).toHaveCount(0);
      const sheet = mockedPage.getByRole("dialog", { name: "Bob Smith" });
      await expect(sheet).toBeVisible();
      await expect(sheet.locator(":focus")).toHaveCount(1);
    });

    test("the command palette closes rather than sit over a sheet that took its focus", async ({
      mockedPage,
    }) => {
      await loadTimeline(mockedPage);
      await block(mockedPage, "res_e2e_002").click();
      await mockedPage.keyboard.press("ControlOrMeta+k");
      const palette = mockedPage.getByRole("dialog", { name: "Command palette", exact: true });
      await expect(palette).toBeVisible();

      await mockedPage.setViewportSize(TABLET);
      await expect(palette).toHaveCount(0);
      await mockedPage.waitForTimeout(500);

      const sheet = mockedPage.getByRole("dialog", { name: "Bob Smith" });
      await expect(sheet.locator(":focus")).toHaveCount(1);
    });
  });

  test.describe("from tablet to desktop", () => {
    test.use({ viewport: TABLET });

    test("focus stays in the Cancel dialog, not on the block the sheet restores to", async ({
      mockedPage,
    }) => {
      await loadTimeline(mockedPage);
      await block(mockedPage, "res_e2e_002").click();
      const sheet = mockedPage.getByRole("dialog", { name: "Bob Smith" });
      await sheet.getByRole("button", { name: "Cancel reservation", exact: true }).click();
      const dialog = mockedPage.getByRole("dialog", { name: "Cancel Reservation" });
      await expect(dialog).toBeVisible();

      await mockedPage.setViewportSize(DESKTOP);
      await mockedPage.waitForTimeout(500);

      await expect(dialog.locator(":focus")).toHaveCount(1);
    });
  });
});

// #8029 item 7: the Edit button the drawer opened from is gone once the surface changes form.
test.describe("Edit across a tablet-to-desktop resize (#8029)", () => {
  test.use({ viewport: TABLET });

  for (const how of ["Save", "Escape"] as const) {
    test(`${how} lands on the block, not the body`, async ({ mockedPage }) => {
      await loadTimeline(mockedPage);
      await block(mockedPage, "res_e2e_002").click();
      await mockedPage.getByTestId("reservation-edit").click();
      const drawer = mockedPage.getByRole("dialog", { name: "Edit Reservation" });
      await expect(drawer).toBeVisible();

      await mockedPage.setViewportSize(DESKTOP);
      await mockedPage.waitForTimeout(300);
      if (how === "Save") await drawer.getByRole("button", { name: /^Save/ }).click();
      else await mockedPage.keyboard.press("Escape");

      await expect(drawer).toHaveCount(0);
      await expect(block(mockedPage, "res_e2e_002")).toBeFocused();
    });
  }
});

// #8029 item 1: Seat now removes the selected reservation until the refetch finds the new one.
test.describe("Seat now over an open sheet (#8029)", () => {
  test.use({ viewport: TABLET });

  test("the old sheet's restore cannot land behind the new sheet", async ({ mockedPage }) => {
    await loadTimeline(mockedPage);
    await block(mockedPage, "res_e2e_002").click();
    await expect(mockedPage.getByRole("dialog", { name: "Bob Smith" })).toBeVisible();
    const dialog = await openWalkInFromPaletteAt(mockedPage);
    // Pins the race the reservation-list response wins about half the time: every animation frame
    // runs late, so the new sheet is always up before the old one's focus restore fires. Installed
    // here, not in an init script: `page.clock` replaces requestAnimationFrame when it installs.
    await mockedPage.evaluate(() => {
      window.requestAnimationFrame = (callback) =>
        window.setTimeout(() => callback(performance.now()), 500);
      window.cancelAnimationFrame = (frame) => window.clearTimeout(frame);
    });

    await dialog.getByRole("button", { name: "Seat now" }).click();
    await expect(dialog).toHaveCount(0);
    await mockedPage.waitForTimeout(1000);

    await expect(modalFocus(mockedPage)).toHaveCount(1);
    await expect(mockedPage.getByRole("dialog", { name: "Bob Smith" })).toHaveCount(0);
    await mockedPage.keyboard.press("Enter");
    await expect(mockedPage.getByRole("dialog", { name: "Bob Smith" })).toHaveCount(0);
  });

  for (const [label, viewport, surface] of [
    ["tablet", TABLET, "Bob Smith"],
    ["phone", PHONE, "Reservation Details"],
  ] as const) {
    test.describe(`until the new reservation loads, at ${label} width`, () => {
      test.use({ viewport });

      test("the old party's controls take no keys", async ({ mockedPage }) => {
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_002").click();
        await expect(mockedPage.getByRole("dialog", { name: surface })).toBeVisible();
        const dialog = await openWalkInFromPaletteAt(mockedPage);
        const list = await holdRequests(mockedPage, /\/api\/v1\/reservations\?/, "GET");
        const writes = recordWrites(mockedPage);

        await dialog.getByRole("button", { name: "Seat now" }).click();
        await expect(dialog).toHaveCount(0);
        await mockedPage.keyboard.press("Enter");
        await mockedPage.waitForTimeout(300);
        const walkInOnly = writes.filter((write) => !write.includes("partySize"));
        list.release("ok");

        expect(walkInOnly).toEqual([]);
        await expect(modalFocus(mockedPage)).toHaveCount(1);
      });
    });
  }
});

// #8029 item 2: where focus goes after Seat Guest is decided when the response arrives.
test.describe("A Seat Guest response that arrives late (#8029)", () => {
  test.describe("at tablet width", () => {
    test.use({ viewport: TABLET });

    test("after a resize and another selection, focus stays with that party", async ({
      mockedPage,
    }) => {
      const seat = await holdRequests(mockedPage, BOB, "PATCH");
      await loadTimeline(mockedPage);
      await block(mockedPage, "res_e2e_002").click();
      await mockedPage.getByRole("button", { name: "Seat Guest" }).click();
      await expect.poll(() => seat.held.length).toBe(1);

      await mockedPage.setViewportSize(DESKTOP);
      await expect(mockedPage.getByTestId("reservation-detail-sidebar")).toBeVisible();
      await block(mockedPage, "res_e2e_003").click();
      await expect(block(mockedPage, "res_e2e_003")).toBeFocused();
      seat.release("ok");
      await expect(mockedPage.getByRole("status")).toContainText("Seated");
      await mockedPage.waitForTimeout(300);

      await expect(block(mockedPage, "res_e2e_003")).toBeFocused();
    });
  });

  for (const [label, viewport, surface] of [
    ["phone", PHONE, "Reservation Details"],
    ["tablet", TABLET, "Bob Smith"],
  ] as const) {
    test.describe(`at ${label} width`, () => {
      test.use({ viewport });

      test("under the walk-in dialog, focus stays in the dialog", async ({ mockedPage }) => {
        const seat = await holdRequests(mockedPage, BOB, "PATCH");
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_002").click();
        await mockedPage.getByRole("button", { name: "Seat Guest" }).click();
        await expect.poll(() => seat.held.length).toBe(1);
        const dialog = await openWalkInFromPaletteAt(mockedPage);
        seat.release("ok");
        await expect(mockedPage.getByRole("status").first()).toContainText("Seated");
        await mockedPage.waitForTimeout(300);

        await expect(dialog.locator(":focus")).toHaveCount(1);
      });

      test("a rejected seat under the walk-in dialog leaves focus in the dialog", async ({
        mockedPage,
      }) => {
        const seat = await holdRequests(mockedPage, BOB, "PATCH");
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_002").click();
        await mockedPage.getByRole("button", { name: "Seat Guest" }).click();
        await expect.poll(() => seat.held.length).toBe(1);
        const dialog = await openWalkInFromPaletteAt(mockedPage);
        seat.release("fail");
        await expect(
          mockedPage.getByRole("dialog", { name: surface }).getByRole("alert")
        ).toHaveCount(1);
        await mockedPage.waitForTimeout(300);

        await expect(dialog.locator(":focus")).toHaveCount(1);
      });

      test("Escape cannot close the surface over a seat in flight, so a failure still shows", async ({
        mockedPage,
      }) => {
        const seat = await holdRequests(mockedPage, BOB, "PATCH");
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_002").click();
        const details = mockedPage.getByRole("dialog", { name: surface });
        await details.getByRole("button", { name: "Seat Guest" }).click();
        await expect.poll(() => seat.held.length).toBe(1);

        await mockedPage.keyboard.press("Escape");
        // Longer than the Drawer's exit, which would keep it visible for a while.
        await mockedPage.waitForTimeout(1000);
        await expect(details).toBeVisible();
        seat.release("fail");

        await expect(details.getByRole("alert")).toHaveCount(1);
      });

      test("a seat that lands after that Escape leaves focus in the surface", async ({
        mockedPage,
      }) => {
        const seat = await holdRequests(mockedPage, BOB, "PATCH");
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_002").click();
        const details = mockedPage.getByRole("dialog", { name: surface });
        await details.getByRole("button", { name: "Seat Guest" }).click();
        await expect.poll(() => seat.held.length).toBe(1);
        await mockedPage.keyboard.press("Escape");
        seat.release("ok");
        await expect(details.getByRole("button", { name: "Seat Guest" })).toHaveCount(0);
        // Longer than the Drawer's exit: focus must not have been on a panel on its way out.
        await mockedPage.waitForTimeout(1000);

        await expect(details).toBeVisible();
        await expect(mockedPage.getByTestId("reservation-edit")).toBeFocused();
      });
    });
  }
});

// #8029 item 5: Escape during a save would close the dialog and hide how the save ended.
test.describe("Escape while a save is in flight (#8029)", () => {
  for (const [label, viewport] of [
    ["phone", PHONE],
    ["tablet", TABLET],
  ] as const) {
    test.describe(`at ${label} width`, () => {
      test.use({ viewport });

      test("a failed cancel still shows its failure", async ({ mockedPage }) => {
        const save = await holdRequests(mockedPage, BOB, "PATCH");
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_002").click();
        await mockedPage.getByRole("button", { name: /^cancel reservation$/i }).click();
        const dialog = mockedPage.getByRole("dialog", { name: "Cancel Reservation" });
        await dialog.getByRole("button", { name: "Cancel Reservation", exact: true }).click();
        await expect.poll(() => save.held.length).toBe(1);

        await mockedPage.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
        save.release("fail");

        await expect(dialog.getByRole("alert")).toHaveCount(1);
      });

      test("a failed no-show still shows its failure", async ({ mockedPage }) => {
        const save = await holdRequests(
          mockedPage,
          /\/api\/v1\/reservations\/res_e2e_003$/,
          "PATCH"
        );
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_003").click();
        await mockedPage.getByRole("button", { name: /^mark no-show$/i }).click();
        const dialog = mockedPage.getByRole("dialog", { name: "Mark No-Show" });
        await dialog.getByRole("button", { name: "Mark No-Show", exact: true }).click();
        await expect.poll(() => save.held.length).toBe(1);

        await mockedPage.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
        save.release("fail");

        await expect(dialog.getByRole("alert")).toHaveCount(1);
      });

      test("a failed edit still shows its failure", async ({ mockedPage }) => {
        const save = await holdRequests(mockedPage, BOB, "PATCH");
        await loadTimeline(mockedPage);
        await block(mockedPage, "res_e2e_002").click();
        await mockedPage.getByTestId("reservation-edit").click();
        const drawer = mockedPage.getByRole("dialog", { name: "Edit Reservation" });
        await drawer.getByRole("button", { name: /^Save/ }).click();
        await expect.poll(() => save.held.length).toBe(1);

        await mockedPage.keyboard.press("Escape");
        await expect(drawer).toBeVisible();
        save.release("fail");

        await expect(drawer.getByRole("alert")).toHaveCount(1);
      });

      test("a failed walk-in still shows its failure", async ({ mockedPage }) => {
        const save = await holdRequests(mockedPage, /\/reservations\/walk-in$/, "POST");
        await loadTimeline(mockedPage);
        await mockedPage.getByRole("button", { name: "Walk-in", exact: true }).click();
        const dialog = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
        await dialog.getByRole("button", { name: "Seat now" }).click();
        await expect.poll(() => save.held.length).toBe(1);

        await mockedPage.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
        save.release("fail");

        await expect(dialog.getByRole("alert")).toHaveCount(1);
      });
    });
  }
});

// #8029 item 6: a table-status result that lands while something covers the table's trigger.
test.describe("A table status result under an overlay (#8029)", () => {
  test.use({ viewport: TABLET });

  test("focus stays in the Cancel dialog", async ({ mockedPage }) => {
    await loadTimeline(mockedPage);
    await mockedPage.locator('[data-testid^="table-status-"]').first().click();
    const status = await holdRequests(mockedPage, /\/api\/v1\/tables\/[^/?]+\/status$/, "PATCH");
    await mockedPage.getByRole("menuitem").first().click();
    await expect.poll(() => status.held.length).toBe(1);

    await block(mockedPage, "res_e2e_002").click();
    const sheet = mockedPage.getByRole("dialog", { name: "Bob Smith" });
    await sheet.getByRole("button", { name: "Cancel reservation", exact: true }).click();
    const dialog = mockedPage.getByRole("dialog", { name: "Cancel Reservation" });
    await expect(dialog).toBeVisible();
    status.release("ok");
    await mockedPage.waitForTimeout(500);

    await expect(dialog.locator(":focus")).toHaveCount(1);
  });

  test("focus stays in the sheet when no dialog is on top of it", async ({ mockedPage }) => {
    await loadTimeline(mockedPage);
    await mockedPage.locator('[data-testid^="table-status-"]').first().click();
    const status = await holdRequests(mockedPage, /\/api\/v1\/tables\/[^/?]+\/status$/, "PATCH");
    await mockedPage.getByRole("menuitem").first().click();
    await expect.poll(() => status.held.length).toBe(1);

    await block(mockedPage, "res_e2e_002").click();
    const sheet = mockedPage.getByRole("dialog", { name: "Bob Smith" });
    await expect(sheet.locator(":focus")).toHaveCount(1);
    status.release("ok");
    await mockedPage.waitForTimeout(500);

    await expect(sheet.locator(":focus")).toHaveCount(1);
  });
});
