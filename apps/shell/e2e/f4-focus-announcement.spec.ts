import { test, expect, type Page } from "@playwright/test";
import { SEL, hospitalityReady, navLink, prepare, report, rialtoReady } from "./support/harness.js";

// ux.md F4, on every crossing: open menus close; the title and lang become the destination's;
// focus lands in the destination's main region; exactly one polite announcement; one working
// skip link first in tab order, targeting the visible app's main region.
async function watchAnnouncements(page: Page) {
  await page.evaluate((sel) => {
    const w = window as unknown as { __announced: string[] };
    w.__announced = [];
    const seen = new WeakMap<Element, string>();
    const record = (el: Element) => {
      const text = (el.textContent ?? "").trim();
      if (text && seen.get(el) !== text) w.__announced.push(text);
      seen.set(el, text);
    };
    document
      .querySelectorAll(sel)
      .forEach((el) => !el.closest("[data-app]") && seen.set(el, (el.textContent ?? "").trim()));
    new MutationObserver((records) =>
      records.forEach((r) => {
        const el = r.target instanceof Element ? r.target : r.target.parentElement;
        const region = el?.closest(sel);
        if (region && !region.closest("[data-app]")) record(region);
      })
    ).observe(document.body, { childList: true, characterData: true, subtree: true });
  }, SEL.liveRegion);
}

const announced = (page: Page) =>
  page.evaluate(() => (window as unknown as { __announced: string[] }).__announced);

test("f4: a crossing moves focus to main, sets title and lang, announces once", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  const hospitalityTitle = await page.title();
  await watchAnnouncements(page);

  await navLink(page, "Design System");
  await rialtoReady(page);
  await page.waitForTimeout(600);

  const state = await page.evaluate((rialto) => {
    const active = document.activeElement;
    return {
      title: document.title,
      lang: document.documentElement.lang,
      focusInRialtoMain: !!active?.closest(`${rialto} main`) || active?.matches(`${rialto} main`),
      currentLinks: [...document.querySelectorAll('#mbe-host-nav [aria-current="page"]')].map((a) =>
        a.textContent?.trim()
      ),
      openMenus: document.querySelectorAll('#mbe-host-nav [aria-expanded="true"]').length,
    };
  }, SEL.rialto);
  const announcements = await announced(page);
  report("f4", "crossing to the design system", { hospitalityTitle, ...state, announcements });

  expect(state.title, "title is the destination's").not.toBe(hospitalityTitle);
  expect(state.lang, "lang is set").not.toBe("");
  expect(state.focusInRialtoMain, "focus is in the destination's main region").toBe(true);
  expect(state.currentLinks, "aria-current moves to the destination").toEqual(["Design System"]);
  expect(state.openMenus, "no menu stays open").toBe(0);
  expect(announcements, "exactly one polite announcement").toHaveLength(1);
  expect(announcements[0], "it says the destination's title").toContain(state.title.split(" ")[0]);
});

test("f4: a hidden app's events make no announcement", async ({ page }, testInfo) => {
  await prepare(page, testInfo);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  await navLink(page, "Design System");
  await rialtoReady(page);
  await page.waitForTimeout(600);
  await watchAnnouncements(page);
  // Hospitality is hidden and its SSE and timers keep running: nothing may be announced.
  await page.waitForTimeout(4000);
  expect(await announced(page), "no announcement for hidden-app events").toEqual([]);
});

test("f4: one working skip link is the first tab stop and targets the visible main", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => {
    const a = document.activeElement as HTMLAnchorElement | null;
    return { tag: a?.tagName, href: a?.getAttribute("href"), text: a?.textContent?.trim() };
  });
  const skipLinks = await page.getByRole("link", { name: /skip to/i }).count();
  await page.keyboard.press("Enter");
  const focusInMain = await page.evaluate(
    (hospitality) =>
      !!document.activeElement?.closest(`${hospitality} main`) ||
      !!document.activeElement?.matches(`${hospitality} main`),
    SEL.hospitality
  );
  report("f4", "skip link", { first, skipLinks, focusInMain });

  expect(first.tag, "first tab stop is a link").toBe("A");
  expect(first.text, "it is the skip link").toMatch(/skip to/i);
  expect(skipLinks, "there is exactly one skip link").toBe(1);
  expect(focusInMain, "activating it moves focus to the visible app's main").toBe(true);
});
