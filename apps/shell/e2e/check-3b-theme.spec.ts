import { test, expect, type Page } from "@playwright/test";
import { SEL, hospitalityReady, navLink, prepare, report, rialtoReady } from "./support/harness.js";

// Spike record: FAIL. The host toggle set `html` dark; both app wrappers stayed `light`.
const read = (page: Page) =>
  page.evaluate(
    ({ hospitality, rialto }) => ({
      html: document.documentElement.dataset["theme"],
      hospitality: document
        .querySelector(`${hospitality} [data-theme]`)
        ?.getAttribute("data-theme"),
      rialto: document.querySelector(`${rialto} [data-theme]`)?.getAttribute("data-theme"),
    }),
    { hospitality: SEL.hospitality, rialto: SEL.rialto }
  );

const toggle = (page: Page) =>
  page
    .locator(SEL.nav)
    .getByRole("button", { name: /theme|dark|light/i })
    .first()
    .click();

async function mountBoth(page: Page) {
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  await navLink(page, "Design System");
  await rialtoReady(page);
}

test("check 3b: the nav toggle changes html and both mounted apps, dark then light", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await mountBoth(page);
  const before = await read(page);
  await toggle(page);
  await expect.poll(() => read(page).then((s) => s.html)).not.toBe(before.html);
  const flipped = await read(page);
  await toggle(page);
  await expect.poll(() => read(page).then((s) => s.html)).toBe(before.html);
  const restored = await read(page);
  report("check 3b", "toggle twice", { before, flipped, restored });

  expect(flipped.hospitality, "hospitality follows html").toBe(flipped.html);
  expect(flipped.rialto, "rialto follows html").toBe(flipped.html);
  expect(restored.hospitality, "hospitality follows back").toBe(before.html);
  expect(restored.rialto, "rialto follows back").toBe(before.html);
});

test("check 3b: the chosen theme persists across a reload and a crossing", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await mountBoth(page);
  const start = (await read(page)).html;
  await toggle(page);
  await expect.poll(() => read(page).then((s) => s.html)).not.toBe(start);
  const chosen = (await read(page)).html;

  await navLink(page, "Hospitality");
  await hospitalityReady(page);
  expect((await read(page)).html, "a crossing keeps the theme").toBe(chosen);

  await page.reload();
  await hospitalityReady(page);
  const afterReload = await read(page);
  report("check 3b", "after reload", { chosen, afterReload });
  expect(afterReload.html, "reload keeps the theme").toBe(chosen);
  expect(afterReload.hospitality, "hospitality keeps the theme").toBe(chosen);
});
