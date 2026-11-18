import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Pin Input docs, light mode. Six 48px cells plus five 8px gaps are 328px,
 * wider than the usage card at a 375px viewport, so the last cell used to
 * paint past the card and the viewport. Cells shrink to the card; at a
 * desktop width they stay on the 48 / 40 / 56 size scale.
 */

const THEME_KEY = "mbe-theme-preference";

interface CellFit {
  left: number;
  right: number;
  width: number;
  height: number;
  cardLeft: number;
  cardRight: number;
  viewport: number;
  mainOverflow: number;
  docOverflow: number;
}

async function openPinInput(page: Page, width: number) {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "light");
  }, THEME_KEY);
  await page.setViewportSize({ width, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("components/pin-input");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
}

function usageGroup(page: Page): Locator {
  return page.getByRole("group", { name: "Authentication Code" });
}

async function pasteCode(cell: Locator, text: string) {
  await cell.evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData("text/plain", value);
    el.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })
    );
  }, text);
}

async function measureUsage(last: Locator): Promise<CellFit> {
  return last.evaluate((el) => {
    const group = el.closest("[role='group']");
    if (!group) throw new Error("usage group missing");
    let node: HTMLElement | null = group.parentElement;
    let panel: HTMLElement | null = null;
    while (node) {
      const heading = [...node.children].find(
        (child) => child.tagName === "H2" && child.textContent?.trim() === "Usage Example"
      );
      if (heading) break;
      if (node.textContent?.includes("Two-Factor Authentication")) panel = node;
      node = node.parentElement;
    }
    const card =
      panel?.firstElementChild instanceof HTMLElement && panel.firstElementChild.contains(group)
        ? panel.firstElementChild
        : panel;
    if (!card) throw new Error("usage card missing");
    const cell = el.getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    const main = document.getElementById("main-content");
    const doc = document.documentElement;
    return {
      left: cell.left,
      right: cell.right,
      width: cell.width,
      height: cell.height,
      cardLeft: bounds.left,
      cardRight: bounds.right,
      viewport: doc.clientWidth,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      docOverflow: doc.scrollWidth - doc.clientWidth,
    };
  });
}

test.describe("pin input at 375px", () => {
  test("two-factor code stays inside the card and the page does not scroll sideways", async ({
    page,
  }) => {
    await openPinInput(page, 375);
    const group = usageGroup(page);
    await group.scrollIntoViewIfNeeded();

    const cells = group.getByRole("textbox");
    await expect(cells).toHaveCount(6);
    const boxes = await Promise.all(
      [0, 1, 2, 3, 4, 5].map(async (index) => {
        const box = await cells.nth(index).boundingBox();
        if (!box) throw new Error(`cell ${index} has no box`);
        return box;
      })
    );
    const fit = await measureUsage(cells.nth(5));

    expect(fit.left).toBeGreaterThanOrEqual(fit.cardLeft - 1);
    expect(fit.right).toBeLessThanOrEqual(fit.cardRight + 1);
    expect(fit.right).toBeLessThanOrEqual(fit.viewport + 1);
    expect(fit.width).toBeGreaterThanOrEqual(24);
    expect(fit.height).toBeGreaterThanOrEqual(24);
    expect(Math.abs(fit.width - fit.height)).toBeLessThanOrEqual(1);
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(fit.cardLeft - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(fit.cardRight + 1);
      expect(box.x + box.width).toBeLessThanOrEqual(fit.viewport + 1);
    }
    for (let i = 0; i < boxes.length - 1; i++) {
      const current = boxes[i];
      const next = boxes[i + 1];
      if (!current || !next) continue;
      expect(next.x).toBeGreaterThanOrEqual(current.x + current.width - 1);
    }

    expect(fit.mainOverflow).toBeLessThanOrEqual(1);
    expect(fit.docOverflow).toBeLessThanOrEqual(1);

    const first = cells.nth(0);
    const second = cells.nth(1);
    await first.click();
    await page.keyboard.type("12");
    await expect(first).toHaveValue("1");
    await expect(second).toHaveValue("2");
    await page.keyboard.press("Backspace");
    await expect(second).toHaveValue("");
    await expect(first).toHaveValue("1");

    await first.click();
    await pasteCode(first, "654321");
    await expect(cells.nth(0)).toHaveValue("6");
    await expect(cells.nth(1)).toHaveValue("5");
    await expect(cells.nth(5)).toHaveValue("1");
  });
});

test.describe("pin input at desktop width", () => {
  test("keeps the size scale and still accepts a pasted code", async ({ page }) => {
    await openPinInput(page, 1280);

    const usage = usageGroup(page);
    const usageCell = await usage.getByRole("textbox").nth(0).boundingBox();
    expect(usageCell?.width).toBeGreaterThanOrEqual(47);
    expect(usageCell?.width).toBeLessThanOrEqual(49);
    expect(usageCell?.height).toBeGreaterThanOrEqual(47);
    expect(usageCell?.height).toBeLessThanOrEqual(49);

    const small = page.getByRole("group", { name: "Small" }).getByRole("textbox").first();
    const large = page.getByRole("group", { name: "Large" }).getByRole("textbox").first();
    const smallBox = await small.boundingBox();
    const largeBox = await large.boundingBox();
    expect(smallBox?.width).toBeGreaterThanOrEqual(39);
    expect(smallBox?.width).toBeLessThanOrEqual(41);
    expect(largeBox?.width).toBeGreaterThanOrEqual(55);
    expect(largeBox?.width).toBeLessThanOrEqual(57);

    const length = page.getByRole("group", { name: "6-digit" });
    const pasted = length.getByRole("textbox");
    await pasteCode(pasted.first(), "654321");
    await expect(pasted.nth(0)).toHaveValue("6");
    await expect(pasted.nth(5)).toHaveValue("1");

    const overflow = await page.evaluate(() => {
      const main = document.getElementById("main-content");
      const doc = document.documentElement;
      return {
        main: main ? main.scrollWidth - main.clientWidth : 0,
        doc: doc.scrollWidth - doc.clientWidth,
      };
    });
    expect(overflow.main).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);
  });
});
