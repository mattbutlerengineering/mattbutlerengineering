import { test, expect, type Page } from "@playwright/test";

/** Persisted by Rialto's useThemeState (`THEME_STORAGE_KEY`). */
const THEME_STORAGE_KEY = "mbe-theme-preference";

/**
 * The column group's ink may sit this far from the wordmark before it reads
 * as off-centre. The bug this guards was ~40px, from a 140px column floor
 * wider than the CONNECT text.
 */
const CENTER_TOLERANCE_PX = 4;

const VIEWPORTS = [
  { label: "narrow", width: 320, height: 700, sideBySide: false },
  { label: "mobile", width: 375, height: 812, sideBySide: false },
  { label: "tablet", width: 768, height: 1024, sideBySide: true },
  { label: "desktop", width: 1280, height: 720, sideBySide: true },
] as const;

const THEMES = ["light", "dark"] as const;

interface FooterAlignment {
  wordmarkCenter: number;
  copyrightCenter: number;
  columnTextCenter: number;
  columnBoxCenter: number;
  navCenter: number;
  columnTops: number[];
  columnTextWidths: number[];
  columnBoxWidths: number[];
  scrollWidth: number;
  clientWidth: number;
}

async function openStatus(page: Page, theme: "light" | "dark", width: number, height: number) {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: THEME_STORAGE_KEY, value: theme }
  );
  await page.emulateMedia({ colorScheme: theme });
  await page.setViewportSize({ width, height });
  await page.goto("/status");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "Rialto Design System" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await footer.scrollIntoViewIfNeeded();
}

/**
 * Centres of the wordmark, the copyright line, and the link columns.
 * Column text is measured from the glyphs (a Range), not the column boxes:
 * a min-width wider than the text centres the boxes while the ink stays left.
 */
async function measureFooter(page: Page): Promise<FooterAlignment> {
  return page.evaluate(() => {
    function ink(el: Element) {
      const range = document.createRange();
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.textContent?.trim()) {
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0) {
            left = Math.min(left, rect.left);
            right = Math.max(right, rect.right);
            top = Math.min(top, rect.top);
          }
        }
        node = walker.nextNode();
      }
      return { left, right, top, center: (left + right) / 2, width: right - left };
    }

    const footer = document.querySelector("footer");
    if (!footer) throw new Error("footer missing");
    const wordmark = footer.firstElementChild;
    const nav = footer.querySelector("nav");
    const copyright = footer.querySelector(":scope > p");
    if (!wordmark || !nav || !copyright) {
      throw new Error("footer is missing wordmark, columns, or copyright");
    }
    const columns = Array.from(nav.children);
    const columnInks = columns.map((col) => ink(col));
    const textLeft = Math.min(...columnInks.map((box) => box.left));
    const textRight = Math.max(...columnInks.map((box) => box.right));
    const boxes = columns.map((col) => col.getBoundingClientRect());
    const boxLeft = Math.min(...boxes.map((box) => box.left));
    const boxRight = Math.max(...boxes.map((box) => box.right));
    const navBox = nav.getBoundingClientRect();
    return {
      wordmarkCenter: ink(wordmark).center,
      copyrightCenter: ink(copyright).center,
      columnTextCenter: (textLeft + textRight) / 2,
      columnBoxCenter: (boxLeft + boxRight) / 2,
      navCenter: navBox.left + navBox.width / 2,
      columnTops: columnInks.map((box) => box.top),
      columnTextWidths: columnInks.map((box) => box.width),
      columnBoxWidths: boxes.map((box) => box.width),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`footer columns centre under the wordmark at ${viewport.width}px (${viewport.label}, ${theme})`, async ({
      page,
    }) => {
      await openStatus(page, theme, viewport.width, viewport.height);
      const measured = await measureFooter(page);
      const textDelta = measured.columnTextCenter - measured.wordmarkCenter;
      const copyDelta = measured.copyrightCenter - measured.wordmarkCenter;
      const detail = JSON.stringify(measured, null, 2);

      expect(
        Math.abs(textDelta),
        `column ink is ${textDelta.toFixed(1)}px from the wordmark\n${detail}`
      ).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);
      expect(
        Math.abs(copyDelta),
        `copyright is ${copyDelta.toFixed(1)}px from the wordmark\n${detail}`
      ).toBeLessThanOrEqual(CENTER_TOLERANCE_PX);
      expect(
        measured.scrollWidth,
        `page is ${measured.scrollWidth}px in a ${measured.clientWidth}px viewport\n${detail}`
      ).toBeLessThanOrEqual(measured.clientWidth + 1);

      if (viewport.sideBySide) {
        const [firstTop, secondTop] = measured.columnTops;
        expect(measured.columnTops, "expected the two link columns").toHaveLength(2);
        expect(firstTop, detail).toBeDefined();
        expect(secondTop, detail).toBeDefined();
        expect(
          Math.abs((firstTop ?? 0) - (secondTop ?? 0)),
          `columns wrapped onto separate rows\n${detail}`
        ).toBeLessThanOrEqual(4);
      }
    });
  }
}
