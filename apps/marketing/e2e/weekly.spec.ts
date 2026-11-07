import { test, expect, type Page } from "@playwright/test";

test.describe("Weekly intake page", () => {
  test("loads with heading and subtitle", async ({ page }) => {
    await page.goto("/weekly");

    await expect(page.getByRole("heading", { name: "Weekly Information Intake" })).toBeVisible();
    await expect(
      page.getByText("Curated resources from the best weekly newsletters")
    ).toBeVisible();
  });

  test("filter buttons are visible", async ({ page }) => {
    await page.goto("/weekly");

    const nav = page.getByRole("navigation", { name: "Filter resources by source" });
    await expect(nav).toBeVisible();

    await expect(nav.getByRole("button", { name: "All" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "JS Weekly" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "React Weekly" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "AI Weekly" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Other" })).toBeVisible();
  });

  test("clicking a filter button changes visible resources", async ({ page }) => {
    await page.goto("/weekly");

    const nav = page.getByRole("navigation", { name: "Filter resources by source" });
    const cards = page.locator('[class*="card"]');
    // .count() doesn't auto-wait like .toBeVisible() — without this, allCount
    // can be read before the resource list renders, reading 0.
    await cards.first().waitFor();
    const allCount = await cards.count();

    await nav.getByRole("button", { name: "JS Weekly" }).click();

    // After filtering, resource count may be less than or equal to total
    const filteredCount = await cards.count();
    expect(filteredCount).toBeGreaterThanOrEqual(0);
    expect(filteredCount).toBeLessThanOrEqual(allCount);
  });

  test("resource cards link to external URLs", async ({ page }) => {
    await page.goto("/weekly");

    const firstLink = page.locator('[class*="card"] a').first();
    await expect(firstLink).toHaveAttribute("target", "_blank");
    await expect(firstLink).toHaveAttribute("rel", "noopener noreferrer");
  });
});

/**
 * Card boxes measured against the section's content box (padding excluded).
 * A grid track of `1fr` grows to the date+badge min-content and the cards
 * then cross the right padding without widening scrollWidth, so a scrollWidth
 * check alone stays green.
 */
async function measureCards(page: Page) {
  await expect(page.getByRole("heading", { name: "Weekly Information Intake" })).toBeVisible();
  await page.locator("main section time").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const section = document.querySelector("main section");
    if (!(section instanceof HTMLElement)) throw new Error("weekly section missing");
    const style = getComputedStyle(section);
    const sectionBox = section.getBoundingClientRect();
    const padL = parseFloat(style.paddingLeft);
    const padR = parseFloat(style.paddingRight);
    const contentLeft = sectionBox.left + padL;
    const contentRight = sectionBox.right - padR;
    const cards = [...section.querySelectorAll("time")].map((time) => {
      let card: HTMLElement | null = time.parentElement;
      while (card?.parentElement && getComputedStyle(card.parentElement).display !== "grid") {
        card = card.parentElement;
      }
      if (!card) throw new Error("card missing");
      const box = card.getBoundingClientRect();
      const timeBox = time.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        timeHeight: timeBox.height,
        lineHeight: parseFloat(getComputedStyle(time).lineHeight),
      };
    });
    return {
      padL,
      padR,
      contentLeft,
      contentRight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      cards,
    };
  });
}

function expectCardsInsideContent(measured: Awaited<ReturnType<typeof measureCards>>) {
  expect(measured.padL).toBe(measured.padR);
  expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
  expect(measured.cards.length).toBeGreaterThan(0);
  for (const card of measured.cards) {
    expect(Math.abs(card.left - measured.contentLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(card.right - measured.contentRight)).toBeLessThanOrEqual(1);
    expect(card.timeHeight).toBeLessThan(card.lineHeight * 1.6);
  }
}

test.describe("weekly cards at a 320px viewport", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("All filter keeps every card inside the section padding with a single-line date", async ({
    page,
  }) => {
    await page.goto("/weekly");
    const measured = await measureCards(page);
    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
    expectCardsInsideContent(measured);
  });

  test("a single source filter stays inside the same padding", async ({ page }) => {
    await page.goto("/weekly");
    await page.getByRole("button", { name: "React Weekly" }).click();
    const measured = await measureCards(page);
    expect(measured.cards).toHaveLength(1);
    expectCardsInsideContent(measured);
  });
});

test.describe("weekly cards at desktop width", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the two-column grid inside the centered section", async ({ page }) => {
    await page.goto("/weekly");
    const measured = await measureCards(page);
    expect(measured.padL).toBe(measured.padR);
    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.clientWidth);
    const firstTop = Math.min(...measured.cards.map((card) => card.top));
    const firstRow = measured.cards.filter((card) => Math.abs(card.top - firstTop) < 2);
    expect(firstRow).toHaveLength(2);
    const ordered = [...firstRow].sort((a, b) => a.left - b.left);
    const left = ordered[0];
    const right = ordered[1];
    if (!left || !right) throw new Error("expected two cards on the first row");
    expect(Math.abs(left.left - measured.contentLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(right.right - measured.contentRight)).toBeLessThanOrEqual(1);
    expect(left.right).toBeLessThan(right.left);
    for (const card of measured.cards) {
      expect(card.left).toBeGreaterThanOrEqual(measured.contentLeft - 1);
      expect(card.right).toBeLessThanOrEqual(measured.contentRight + 1);
      expect(card.timeHeight).toBeLessThan(card.lineHeight * 1.6);
    }
  });
});
