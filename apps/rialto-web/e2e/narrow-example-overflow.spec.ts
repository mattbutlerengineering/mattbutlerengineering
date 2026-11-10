import { test, expect, type Page } from "@playwright/test";

/**
 * 375px mobile column for the Rialto examples. Confirmed on the live site:
 * notification messages and timestamps painted past the card (main scroll
 * width 565), and the guest-profile tab row plus the 300px contact card
 * were wider than the column. Wider viewports must keep the same pages
 * from scrolling sideways, and the guest panels stay side by side once
 * the column can hold two 300px tracks.
 */

const CONSENT = JSON.stringify({
  consented: true,
  preferences: { essential: true, analytics: true, functional: true, marketing: true },
});

async function openExample(page: Page, path: string, width: number, scheme: "light" | "dark") {
  await page.addInitScript((consent) => {
    window.localStorage.setItem("rialto-cookie-consent", consent);
  }, CONSENT);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
  await page.setViewportSize({ width, height: 676 });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
  await page.evaluate(() => document.fonts.ready);
}

/** Scroll the page vertically to the tab row, then click the label's visible leading edge. */
async function clickTabEdge(page: Page, name: string) {
  await page.evaluate(() => {
    const main = document.querySelector("main");
    const list = document.querySelector('[role="tablist"]');
    if (!main || !list) return;
    main.scrollTop += list.getBoundingClientRect().top - 160;
  });
  const tab = page.getByRole("tab", { name });
  const box = await tab.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + 8, box!.y + box!.height / 2);
  return tab;
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const doc = document.documentElement;
    return {
      main: main ? main.scrollWidth - main.clientWidth : 0,
      doc: doc.scrollWidth - doc.clientWidth,
      scrollLeft: main?.scrollLeft ?? 0,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("notification rows stay inside the card at 375px", async ({ page }) => {
  await openExample(page, "examples/notification-center", 375, "light");

  const overflow = await horizontalOverflow(page);
  expect(overflow.main).toBeLessThanOrEqual(1);
  expect(overflow.doc).toBeLessThanOrEqual(1);

  const rows = page.getByRole("list", { name: "Notifications" }).getByRole("button");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    const escaped = await row.evaluate((el) => {
      const rowBox = el.getBoundingClientRect();
      return [...el.querySelectorAll("*")].some((child) => {
        const childBox = child.getBoundingClientRect();
        return childBox.width > 1 && childBox.right > rowBox.right + 1;
      });
    });
    expect(escaped).toBe(false);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1);
  }

  const first = rows.first();
  const title = first.getByText("New reservation confirmed");
  const message = first.getByText("Elena Marchetti booked Suite 402");
  const titleBox = await title.boundingBox();
  const messageBox = await message.boundingBox();
  expect(titleBox).not.toBeNull();
  expect(messageBox).not.toBeNull();
  expect(messageBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 1);
});

test("notification rows stay inside the card at 375px in dark mode", async ({ page }) => {
  await openExample(page, "examples/notification-center", 375, "dark");
  const overflow = await horizontalOverflow(page);
  expect(overflow.main).toBeLessThanOrEqual(1);
  expect(overflow.doc).toBeLessThanOrEqual(1);

  const row = page.getByRole("list", { name: "Notifications" }).getByRole("button").first();
  const escaped = await row.evaluate((el) => {
    const rowBox = el.getBoundingClientRect();
    return [...el.querySelectorAll("*")].some((child) => {
      const childBox = child.getBoundingClientRect();
      return childBox.width > 1 && childBox.right > rowBox.right + 1;
    });
  });
  expect(escaped).toBe(false);
});

for (const width of [768, 1024, 1280]) {
  test(`notification center does not scroll sideways at ${width}px`, async ({ page }) => {
    await openExample(page, "examples/notification-center", width, "light");
    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);

    const row = page.getByRole("list", { name: "Notifications" }).getByRole("button").first();
    const message = row.getByText("Elena Marchetti booked Suite 402");
    const rowBox = await row.boundingBox();
    const messageBox = await message.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(messageBox).not.toBeNull();
    expect(messageBox!.x + messageBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 1);
  });
}

test("guest profile tabs and contact card fit the 375px column", async ({ page }) => {
  await openExample(page, "examples/guest-profile", 375, "light");

  const before = await horizontalOverflow(page);
  expect(before.main).toBeLessThanOrEqual(1);
  expect(before.doc).toBeLessThanOrEqual(1);

  const boxes = await page.evaluate(() => {
    function cardOf(name: string) {
      const heading = [...document.querySelectorAll("h2, h3")].find(
        (el) => el.textContent?.trim() === name
      );
      let node = heading?.parentElement ?? null;
      while (node && node.tagName !== "MAIN") {
        const style = getComputedStyle(node);
        if (parseFloat(style.borderTopWidth) >= 1 && parseFloat(style.paddingTop) >= 8) {
          const rect = node.getBoundingClientRect();
          return { x: rect.x, right: rect.right, width: rect.width };
        }
        node = node.parentElement;
      }
      return null;
    }
    const tablist = document.querySelector('[role="tablist"]');
    const tabRect = tablist?.getBoundingClientRect();
    return {
      identity: cardOf("Elena Marchetti"),
      contact: cardOf("Contact details"),
      preferences: cardOf("Preferences"),
      tablist: tabRect
        ? {
            x: tabRect.x,
            right: tabRect.right,
            width: tabRect.width,
            scrollLeft: tablist?.scrollLeft ?? 0,
          }
        : null,
    };
  });

  expect(boxes.identity).not.toBeNull();
  expect(boxes.contact).not.toBeNull();
  expect(boxes.preferences).not.toBeNull();
  expect(boxes.tablist).not.toBeNull();
  expect(boxes.contact!.right).toBeLessThanOrEqual(boxes.identity!.right + 1);
  expect(boxes.preferences!.right).toBeLessThanOrEqual(boxes.identity!.right + 1);
  expect(boxes.tablist!.right).toBeLessThanOrEqual(boxes.identity!.right + 1);

  const related = await clickTabEdge(page, "Related records");
  await expect(related).toHaveAttribute("aria-selected", "true");

  const after = await horizontalOverflow(page);
  expect(after.scrollLeft).toBeLessThanOrEqual(1);
  expect(after.main).toBeLessThanOrEqual(1);
  expect(after.doc).toBeLessThanOrEqual(1);

  const tabInsideList = await related.evaluate((el) => {
    const list = el.closest('[role="tablist"]');
    if (!list) return false;
    const tab = el.getBoundingClientRect();
    const row = list.getBoundingClientRect();
    return tab.right <= row.right + 1 && tab.left >= row.left - 1;
  });
  expect(tabInsideList).toBe(true);
});

test("guest profile does not scroll sideways at 375px in dark mode", async ({ page }) => {
  await openExample(page, "examples/guest-profile", 375, "dark");
  const overflow = await horizontalOverflow(page);
  expect(overflow.main).toBeLessThanOrEqual(1);
  expect(overflow.doc).toBeLessThanOrEqual(1);

  const related = await clickTabEdge(page, "Related records");
  await expect(related).toHaveAttribute("aria-selected", "true");
  const after = await horizontalOverflow(page);
  expect(after.scrollLeft).toBeLessThanOrEqual(1);
  expect(after.main).toBeLessThanOrEqual(1);
});

for (const width of [768, 1024, 1280]) {
  test(`guest profile stays in the column at ${width}px`, async ({ page }) => {
    await openExample(page, "examples/guest-profile", width, "light");
    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);

    const sideBySide = await page.evaluate(() => {
      function cardOf(name: string) {
        const heading = [...document.querySelectorAll("h2, h3")].find(
          (el) => el.textContent?.trim() === name
        );
        let node = heading?.parentElement ?? null;
        while (node && node.tagName !== "MAIN") {
          const style = getComputedStyle(node);
          if (parseFloat(style.borderTopWidth) >= 1 && parseFloat(style.paddingTop) >= 8) {
            return node.getBoundingClientRect();
          }
          node = node.parentElement;
        }
        return null;
      }
      const contact = cardOf("Contact details");
      const preferences = cardOf("Preferences");
      if (!contact || !preferences) return null;
      return preferences.x >= contact.right - 1;
    });

    // 768px with the sidebar open leaves one column. 1024 and 1280 fit two.
    if (width === 768) expect(sideBySide).toBe(false);
    else expect(sideBySide).toBe(true);
  });
}
