import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { countFirstPaintControls, weekPanel } from "./helpers/first-paint.js";
import { firstPaint, pinToday } from "./helpers/scenario-fixtures.js";

/**
 * #8690: the regular-week form is calm on first paint and its Save stays in reach. On the
 * one-schedule fixture at 1280x800 the Schedules layer (form included) has at most 20 controls and
 * is at most 1.2 screens tall; after one time change Save is inside the viewport at 1280x800 and
 * 375x812 without scrolling.
 */

const DESKTOP = { width: 1280, height: 800 } as const;
const PHONE = { width: 375, height: 812 } as const;

/** How many viewport heights the page's content spans (the main area is the scroll container). */
async function screensTall(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector("main#main-content");
    if (!main) throw new Error("no <main id=main-content> on the page");
    const bottom = Math.max(
      document.documentElement.scrollHeight,
      main.scrollHeight + main.getBoundingClientRect().top
    );
    return bottom / window.innerHeight;
  });
}

/** Opens the first service's line and moves its closing time: the smallest edit that makes the form dirty. */
async function changeFirstClose(page: Page): Promise<void> {
  const panel = weekPanel(page);
  await panel
    .getByRole("button", { expanded: false })
    .filter({ hasText: /\d:\d\d [AP]M/ })
    .first()
    .click();
  const closes = panel.getByRole("combobox", { name: "Closes" }).first();
  const before = await closes.inputValue();
  await closes.click();
  const options = page.getByRole("listbox", { name: "Closes" }).getByRole("option");
  const target =
    (await options.first().textContent()) === before ? options.nth(1) : options.first();
  await target.click();
}

test.describe("Calm regular week (#8690)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("first paint at 1280x800 has at most 20 controls and fits 1.2 screens", async ({
    mockedPage: page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await firstPaint(page);
    await page.waitForLoadState("networkidle");
    const { count, controls } = await countFirstPaintControls(page, null);
    test.info().annotations.push({
      type: "first paint controls (whole main, agent stand-in)",
      description: `${count}: ${controls.join(" | ")}`,
    });
    expect(count, controls.join("\n")).toBeLessThanOrEqual(20);
    expect(await screensTall(page)).toBeLessThanOrEqual(1.2);
  });

  for (const [label, viewport] of [
    ["1280x800", DESKTOP],
    ["375x812", PHONE],
  ] as const) {
    test(`after one time change Save is inside the viewport at ${label}`, async ({
      mockedPage: page,
    }) => {
      await page.setViewportSize(viewport);
      await firstPaint(page);
      await changeFirstClose(page);
      const save = weekPanel(page).getByRole("button", { name: "Save", exact: true });
      await expect(save).toBeVisible();
      await expect(save).toBeInViewport({ ratio: 1 });
    });
  }
});
