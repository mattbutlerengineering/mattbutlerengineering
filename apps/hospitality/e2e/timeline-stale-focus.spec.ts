import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { localDay } from "./local-day.js";

// #8047: a focus request that waits for its target must not fire once the Host has done something
// else, and must not land behind an open command palette.
const DESK = { width: 1280, height: 720 };
const TABLET = { width: 900, height: 1100 };

/** Past the point a focus landing would have happened; absence has nothing else to wait on. */
const SETTLE_MS = 400;

const palette = (page: Page) => page.getByRole("dialog", { name: "Command palette", exact: true });
const walkInBlock = (page: Page) =>
  page.locator('[data-testid^="reservation-block-res_e2e_walkin_"]');

async function loadTimeline(page: Page) {
  await page.setViewportSize(DESK);
  await page.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
  await page.goto("timeline");
  await expect(page.getByTestId("reservation-block-res_e2e_002")).toBeVisible();
}

async function pressSeatNow(page: Page) {
  await page.getByRole("button", { name: "Walk-in", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Seat walk-in" })
    .getByRole("button", { name: "Seat now" })
    .click();
}

/** Opens the palette and clicks its search icon, which is not a control, so focus comes loose. */
async function openPaletteAndClickItsIcon(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeVisible();
  await palette(page).locator("svg").first().click({ force: true });
}

const focusIsInPalette = (page: Page) =>
  page.evaluate(
    () =>
      document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label") ===
      "Command palette"
  );

/** Holds the first matching write until released; it then fails. Later ones are counted and fail. */
async function holdWrite(page: Page, url: RegExp, method: string) {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let sent = 0;
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.fallback();
    sent += 1;
    if (sent === 1) await gate;
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "X", message: "boom" } }),
    });
  });
  return { release, sent: () => sent };
}

test.describe("A focus request the Host has moved on from (#8047 item 1)", () => {
  async function seatFromTomorrow(page: Page) {
    await loadTimeline(page);
    await page.getByRole("button", { name: "Next day" }).click();
    await pressSeatNow(page);
    await expect(page.getByRole("dialog", { name: "Seat walk-in" })).toHaveCount(0);
    // The new reservation is on today, so its block does not render here and the request waits.
    await expect(walkInBlock(page)).toHaveCount(0);
  }

  test("browser Back does not fire it", async ({ mockedPage }) => {
    await seatFromTomorrow(mockedPage);
    await mockedPage.goBack();
    await expect(walkInBlock(mockedPage)).toBeVisible();
    await mockedPage.waitForTimeout(SETTLE_MS);
    await expect(walkInBlock(mockedPage)).not.toBeFocused();
  });

  test("a click on Today does not fire it", async ({ mockedPage }) => {
    await seatFromTomorrow(mockedPage);
    await mockedPage.getByRole("button", { name: "Today", exact: true }).click();
    await expect(walkInBlock(mockedPage)).toBeVisible();
    await mockedPage.waitForTimeout(SETTLE_MS);
    await expect(walkInBlock(mockedPage)).not.toBeFocused();
  });

  test("a key press does not fire it", async ({ mockedPage }) => {
    await seatFromTomorrow(mockedPage);
    await mockedPage.keyboard.press("Shift");
    // A script click: no pointer event of its own, so only the key press can have cancelled.
    await mockedPage.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "Today")
        ?.click()
    );
    await expect(walkInBlock(mockedPage)).toBeVisible();
    await mockedPage.waitForTimeout(SETTLE_MS);
    await expect(walkInBlock(mockedPage)).not.toBeFocused();
  });

  test("a Host who touched nothing still gets an 11 s refetch landing", async ({ mockedPage }) => {
    test.setTimeout(60_000);
    await loadTimeline(mockedPage);
    await mockedPage.route(/\/api\/v1\/reservations\?/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      await route.fallback();
    });
    await pressSeatNow(mockedPage);
    await expect(walkInBlock(mockedPage)).toBeFocused({ timeout: 20_000 });
  });
});

test.describe("Late failures with focus loose inside the palette (#8047 item 2)", () => {
  const flows = [
    {
      name: "Save in Edit",
      submit: async (page: Page) => {
        await page.getByTestId("reservation-edit").click();
        await page
          .getByRole("dialog", { name: "Edit Reservation" })
          .getByRole("button", { name: /^Save/ })
          .click();
      },
    },
    {
      name: "confirm in Cancel",
      submit: async (page: Page) => {
        await page
          .getByRole("button", { name: /^Cancel reservation$/i })
          .first()
          .click();
        await page
          .getByRole("dialog", { name: "Cancel Reservation" })
          .getByRole("button", { name: "Cancel Reservation", exact: true })
          .click();
      },
    },
  ];

  for (const viewport of [DESK, TABLET]) {
    for (const flow of flows) {
      test(`${flow.name} at ${viewport.width}: Enter sends no second write`, async ({
        mockedPage,
      }) => {
        const write = await holdWrite(mockedPage, /\/api\/v1\/reservations\/res_e2e_002$/, "PATCH");
        await loadTimeline(mockedPage);
        await mockedPage.setViewportSize(viewport);
        await mockedPage.getByTestId("reservation-block-res_e2e_002").click();
        await flow.submit(mockedPage);
        await expect.poll(write.sent).toBe(1);

        await openPaletteAndClickItsIcon(mockedPage);
        write.release();
        await mockedPage.waitForTimeout(SETTLE_MS);

        const landedInPalette = await focusIsInPalette(mockedPage);
        await mockedPage.keyboard.press("Enter");
        await mockedPage.waitForTimeout(SETTLE_MS);
        expect(write.sent()).toBe(1);
        expect(landedInPalette).toBe(true);
      });
    }
  }
});

test("Shift+Tab from focus loose in the palette stays in the palette (#8047 item 2)", async ({
  mockedPage,
}) => {
  await loadTimeline(mockedPage);
  await openPaletteAndClickItsIcon(mockedPage);
  await mockedPage.keyboard.press("Shift+Tab");
  expect(await focusIsInPalette(mockedPage)).toBe(true);
});

test.describe("The walk-in's block arriving behind the palette (#8047 item 3)", () => {
  async function expectBlockLeftAlone(page: Page) {
    await expect(walkInBlock(page)).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(SETTLE_MS);
    await expect(walkInBlock(page)).not.toBeFocused();
    expect(await focusIsInPalette(page)).toBe(true);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.getByTestId("reservation-detail-sidebar")).toHaveCount(0);
  }

  test("after Seat now, with the refetch delayed and focus loose in the palette", async ({
    mockedPage,
  }) => {
    await loadTimeline(mockedPage);
    await mockedPage.route(/\/api\/v1\/reservations\?/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      await route.fallback();
    });
    await pressSeatNow(mockedPage);
    await expect(mockedPage.getByRole("dialog", { name: "Seat walk-in" })).toHaveCount(0);
    await openPaletteAndClickItsIcon(mockedPage);

    await expectBlockLeftAlone(mockedPage);
  });

  // The palette is already up when the request is made, so no later key or click can cancel it.
  test("with the palette opened while the walk-in was still sending", async ({ mockedPage }) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await mockedPage.route(/\/api\/v1\/reservations\/walk-in$/, async (route) => {
      await gate;
      await route.fallback();
    });
    await loadTimeline(mockedPage);
    await pressSeatNow(mockedPage);
    await mockedPage.keyboard.press("ControlOrMeta+k");
    await expect(palette(mockedPage)).toBeVisible();
    release();

    await expectBlockLeftAlone(mockedPage);
  });
});
