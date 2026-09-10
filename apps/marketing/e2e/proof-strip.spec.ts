import { test, expect, type Page } from "@playwright/test";

/**
 * The proof strip's figures are `Odometer` flip boards: rows of em-sized cells
 * that cannot wrap, shrink, or ellipsize. When a card is narrower than the
 * figure it holds, the reels do not reflow — they render straight over the card
 * border and on top of the neighbouring card, which is what production shipped
 * with a four-digit "1,074" in a 246px column.
 *
 * `mobile-overflow.spec.ts` cannot catch this: the spill stays inside the
 * document, so `scrollWidth` never exceeds the viewport. The containment has to
 * be measured against each card, and at desktop widths, where the reels are
 * largest.
 */

/** Widths where a two-up card has to hold an `lg` (>=901px) or `md` figure. */
const DESKTOP_VIEWPORTS = [
  { label: "wide-desktop", width: 1440, height: 1000 },
  { label: "laptop", width: 1280, height: 900 },
  { label: "small-laptop", width: 1024, height: 800 },
  { label: "tablet-landscape", width: 900, height: 800 },
  { label: "tablet-portrait", width: 820, height: 1000 },
] as const;

/** Card padding box vs. figure box, per metric card, in CSS px. */
async function measureMetricCards(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-reveal="proof"]');
    if (!grid) throw new Error('proof strip grid ([data-reveal="proof"]) not found');

    return Array.from(grid.children).map((wrapper) => {
      // CSS-module class names are hashed but keep their authored prefix, and
      // the figure wrapper is the only `.metricValue` in the card. The Card
      // itself is the reveal wrapper's only child.
      const figure = wrapper.querySelector('[class*="metricValue"]');
      const card = wrapper.firstElementChild;
      if (!figure || !card) throw new Error("metric card rendered no figure");

      const cardBox = card.getBoundingClientRect();
      const figureBox = figure.getBoundingClientRect();
      // The label is the Stack sibling that follows the figure.
      const label = figure.nextElementSibling?.textContent?.trim() ?? "(unlabelled)";

      return {
        label,
        cardHeight: Math.round(cardBox.height),
        // Positive means the figure hangs past the card edge.
        overhangLeft: Math.round(cardBox.left - figureBox.left),
        overhangRight: Math.round(figureBox.right - cardBox.right),
      };
    });
  });
}

for (const viewport of DESKTOP_VIEWPORTS) {
  test.describe(`proof strip @ ${viewport.label} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("keeps every figure inside its own card", async ({ page }) => {
      await page.goto("/");
      const strip = page.locator("#proof");
      await strip.scrollIntoViewIfNeeded();
      // The reels roll on reveal; measure the landed figure, not a mid-flip one.
      await expect(strip.getByRole("heading", { name: /by the numbers/i })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(2_500);

      const cards = await measureMetricCards(page);
      expect(cards).toHaveLength(4);

      for (const card of cards) {
        expect(
          card.overhangRight,
          `"${card.label}" figure hangs ${card.overhangRight}px past its card's right edge`
        ).toBeLessThanOrEqual(0);
        expect(
          card.overhangLeft,
          `"${card.label}" figure hangs ${card.overhangLeft}px past its card's left edge`
        ).toBeLessThanOrEqual(0);
      }
    });

    test("gives every card the same height, whatever its label wraps to", async ({ page }) => {
      await page.goto("/");
      const strip = page.locator("#proof");
      await strip.scrollIntoViewIfNeeded();
      await expect(strip.getByRole("heading", { name: /by the numbers/i })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const heights = (await measureMetricCards(page)).map((card) => card.cardHeight);

      expect(new Set(heights).size, `card heights differ: ${heights.join(", ")}`).toBe(1);
    });
  });
}
