import { test, expect, type Page } from "@playwright/test";

/** Persisted by Rialto's useThemeState (`THEME_STORAGE_KEY`). */
const THEME_STORAGE_KEY = "mbe-theme-preference";

/**
 * Ink may sit this far from equal side gaps before a card reads as off-centre.
 * The bug this guards was 32px on the left and 8px on the right.
 */
const CENTER_TOLERANCE_PX = 2;

/** Subpixel and border rounding. A real overflow is tens of pixels. */
const EDGE_SLACK_PX = 1;

const VIEWPORTS = [
  { label: "narrow", width: 320, height: 700 },
  { label: "mobile", width: 375, height: 812 },
] as const;

const THEMES = ["light", "dark"] as const;

const STAT_LABELS = [
  "Agent-authored PRs merged",
  "Pull requests merged",
  "Rialto components",
  "Test files",
] as const;

interface NarrowLayout {
  clientWidth: number;
  scrollWidth: number;
  statCards: { label: string; left: number; rightGap: number; width: number }[];
  badges: { text: string; overflowRight: number; overlapsSibling: boolean }[];
}

async function openHome(page: Page, theme: "light" | "dark", width: number, height: number) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: theme }
  );
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "By the numbers" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

/**
 * Stat-card side gaps, and whether a stage badge paints past its own card
 * (which is how "2647 pull requests merged" lands on the next card).
 */
async function measureNarrowLayout(page: Page): Promise<NarrowLayout> {
  return page.evaluate(
    (labels) => {
      const clientWidth = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;

      function cardFor(start: Element | null, boundary: Element | null): Element | null {
        let card = start;
        while (card && card !== boundary) {
          const style = getComputedStyle(card);
          if (parseFloat(style.borderTopWidth) > 0 && parseFloat(style.paddingLeft) > 0)
            return card;
          card = card.parentElement;
        }
        return null;
      }

      const proof = document.getElementById("proof");
      const statCards = labels.map((label) => {
        const text = [...(proof?.querySelectorAll("*") ?? [])].find(
          (el) => el.childNodes.length === 1 && el.textContent?.trim() === label
        );
        const card = cardFor(text?.parentElement ?? null, proof);
        const rect = card?.getBoundingClientRect();
        return {
          label,
          left: rect ? rect.left : Number.NaN,
          rightGap: rect ? clientWidth - rect.right : Number.NaN,
          width: rect ? rect.width : Number.NaN,
        };
      });

      const machineryHeading = [...document.querySelectorAll("h2")].find((heading) =>
        heading.textContent?.includes("How this site ships itself")
      );
      const machinery = machineryHeading?.closest("section") ?? null;
      const badgeEls = [...(machinery?.querySelectorAll("span") ?? [])].filter((el) =>
        /agent PRs merged|test files|pull requests merged|components shipped/.test(
          el.textContent ?? ""
        )
      );
      const cardRects = badgeEls.map((badge) =>
        cardFor(badge.parentElement, machinery)?.getBoundingClientRect()
      );
      const badges = badgeEls.map((badge, index) => {
        const badgeRect = badge.getBoundingClientRect();
        const own = cardRects[index];
        const overlapsSibling = cardRects.some((other, otherIndex) => {
          if (otherIndex === index || !other) return false;
          const separated =
            badgeRect.right <= other.left + 1 ||
            badgeRect.left >= other.right - 1 ||
            badgeRect.bottom <= other.top + 1 ||
            badgeRect.top >= other.bottom - 1;
          return !separated;
        });
        return {
          text: badge.textContent?.trim() ?? "",
          overflowRight: own ? badgeRect.right - own.right : Number.POSITIVE_INFINITY,
          overlapsSibling,
        };
      });

      return { clientWidth, scrollWidth, statCards, badges };
    },
    [...STAT_LABELS]
  );
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`home cards stay inside a ${viewport.label} ${theme} viewport`, async ({ page }) => {
      await openHome(page, theme, viewport.width, viewport.height);
      const layout = await measureNarrowLayout(page);

      expect(
        layout.scrollWidth,
        `page is ${layout.scrollWidth}px wide in a ${layout.clientWidth}px viewport`
      ).toBeLessThanOrEqual(layout.clientWidth + EDGE_SLACK_PX);

      expect(layout.statCards, "expected one card per proof-strip figure").toHaveLength(
        STAT_LABELS.length
      );
      for (const card of layout.statCards) {
        expect(card.left, `${card.label} is missing`).not.toBeNaN();
        expect(
          Math.abs(card.left - card.rightGap),
          `${card.label} is ${card.width}px wide with ${card.left}px on the left and ${card.rightGap}px on the right`
        ).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);
        expect(card.left + card.width).toBeLessThanOrEqual(layout.clientWidth + EDGE_SLACK_PX);
      }

      expect(
        layout.badges.length,
        "expected a metric badge on the stages that count"
      ).toBeGreaterThan(0);
      for (const badge of layout.badges) {
        expect(
          badge.overflowRight,
          `${badge.text} extends ${badge.overflowRight}px past its step card`
        ).toBeLessThanOrEqual(EDGE_SLACK_PX);
        expect(badge.overlapsSibling, `${badge.text} overlaps another step card`).toBe(false);
      }
    });
  }
}
