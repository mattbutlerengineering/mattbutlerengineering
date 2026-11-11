import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * QA audit of the component demos at 375×800 in dark mode. Each assertion
 * is the failure that was reproduced on the live site: clipped crumbs,
 * a see-through command palette, a drawer title under the sticky nav, a
 * calendar past its card, pagination and segmented controls wider than the
 * viewport, colliding step labels, and overlapping see-through toasts.
 */

const THEME_KEY = "mbe-theme-preference";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function horizontalOverlap(a: Box, b: Box): number {
  const y = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (y <= 1) return 0;
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("expected a laid-out box");
  return box;
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const main = document.getElementById("main-content");
    const doc = document.documentElement;
    return {
      main: main ? main.scrollWidth - main.clientWidth : 0,
      doc: doc.scrollWidth - doc.clientWidth,
      mainScrollLeft: main ? main.scrollLeft : 0,
    };
  });
}

function parseColor(background: string): { r: number; g: number; b: number; a: number } {
  const match = background.match(/rgba?\(([^)]+)\)/);
  if (!match?.[1]) throw new Error(`unparsed color: ${background}`);
  const parts = match[1].split(",").map((part) => Number(part.trim()));
  return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
}

test.describe("narrow component demos", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "dark");
    }, THEME_KEY);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("breadcrumb crumbs stay inside the column and the usage card", async ({ page }) => {
    await page.goto("components/breadcrumb");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const deep = page.getByRole("navigation", { name: "Deep path" });
    const names = ["Home", "Telemetry", "Sessions", "Fiorano"] as const;
    const boxes = await Promise.all(names.map((name) => boxOf(deep.getByRole("link", { name }))));
    const lap = await boxOf(deep.getByText("Lap 14", { exact: true }));
    boxes.push(lap);

    const nav = await boxOf(deep);
    for (const crumb of boxes) {
      expect(crumb.x).toBeGreaterThanOrEqual(nav.x - 8);
      expect(crumb.x + crumb.width).toBeLessThanOrEqual(nav.x + nav.width + 8);
    }
    // "Lap 14" used to wrap onto two lines while the crumbs ran into the chevrons.
    expect(lap.height).toBeLessThanOrEqual((boxes[0]?.height ?? lap.height) + 4);
    for (let i = 0; i < boxes.length - 1; i++) {
      const current = boxes[i];
      const next = boxes[i + 1];
      if (current && next) expect(horizontalOverlap(current, next)).toBeLessThanOrEqual(8);
    }

    const usage = page.getByRole("navigation", { name: "Dashboard drivers path" });
    const analysis = usage.getByText("Lap Analysis", { exact: true });
    const edges = await analysis.evaluate((el) => {
      const card = el.closest("nav")?.parentElement;
      if (!card) throw new Error("usage card missing");
      const label = el.getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      return {
        labelRight: label.right,
        cardRight: bounds.right,
        labelLeft: label.left,
        cardLeft: bounds.left,
      };
    });
    expect(edges.labelLeft).toBeGreaterThanOrEqual(edges.cardLeft - 1);
    expect(edges.labelRight).toBeLessThanOrEqual(edges.cardRight + 1);

    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);
  });

  test("command palette empty state is an opaque panel", async ({ page }) => {
    await page.goto("components/command-palette");
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const dialog = page.getByRole("dialog", { name: "Command palette" });
    await dialog.getByRole("combobox", { name: "Search commands" }).fill("zzzz");
    await expect(dialog.getByText("No results found")).toBeVisible();

    const paint = await dialog.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, filter: style.backdropFilter };
    });
    expect(paint.filter).toBe("none");
    const color = parseColor(paint.background);
    expect(color).toEqual({ r: 42, g: 39, b: 37, a: 1 });

    const heading = page.getByRole("heading", { name: "Command Palette", level: 1 });
    const covered = await heading.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit?.closest("[role='dialog']") != null;
    });
    expect(covered).toBe(true);
  });

  test("drawer title and close button paint above the sticky header", async ({ page }) => {
    await page.goto("components/drawer");
    await page.getByRole("button", { name: "Right (default)" }).click();
    const title = page.getByRole("heading", { name: "Session Settings" });
    await expect(title).toBeVisible();

    const titleHit = await title.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + 12, rect.y + rect.height / 2);
      return hit?.closest("[role='dialog']") != null;
    });
    expect(titleHit).toBe(true);

    const close = page.getByRole("button", { name: "Close" });
    const closeHit = await close.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit?.closest("[role='dialog']") != null;
    });
    expect(closeHit).toBe(true);
  });

  test("date range Saturday column stays inside its card", async ({ page }) => {
    await page.goto("components/date-range");
    const saturday = page.getByRole("columnheader", { name: "Saturday" }).first();
    const edges = await saturday.evaluate((el) => {
      const calendar = el.closest("[role='grid']")?.parentElement;
      const card = calendar?.parentElement;
      if (!card) throw new Error("date range card missing");
      const label = el.getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      const day = calendar?.querySelector<HTMLElement>("[data-date='2026-07-18']");
      const dayBox = day?.getBoundingClientRect();
      return {
        labelRight: label.right,
        dayRight: dayBox?.right ?? label.right,
        cardRight: bounds.right,
        cardLeft: bounds.left,
        labelLeft: label.left,
      };
    });
    expect(edges.labelLeft).toBeGreaterThanOrEqual(edges.cardLeft - 1);
    expect(edges.labelRight).toBeLessThanOrEqual(edges.cardRight + 1);
    expect(edges.dayRight).toBeLessThanOrEqual(edges.cardRight + 1);

    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);
  });

  test("pagination fits the viewport and the usage card", async ({ page }) => {
    await page.goto("components/pagination");
    const large = page.getByRole("navigation", { name: "Large range with ellipsis pagination" });
    await large.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const next = await boxOf(large.getByRole("button", { name: "Next page" }));
    const main = await boxOf(page.locator("#main-content"));
    expect(next.x).toBeGreaterThanOrEqual(main.x - 1);
    expect(next.x + next.width).toBeLessThanOrEqual(main.x + main.width + 1);

    const usage = page.getByRole("navigation", { name: "Usage example pagination" });
    const fitted = await usage.evaluate((el) => {
      const card = el.parentElement?.parentElement;
      if (!card) throw new Error("usage card missing");
      const row = el.getBoundingClientRect();
      const bounds = card.getBoundingClientRect();
      return {
        rowLeft: row.left,
        rowRight: row.right,
        cardLeft: bounds.left,
        cardRight: bounds.right,
      };
    });
    expect(fitted.rowLeft).toBeGreaterThanOrEqual(fitted.cardLeft - 1);
    expect(fitted.rowRight).toBeLessThanOrEqual(fitted.cardRight + 1);

    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);
    expect(overflow.mainScrollLeft).toBe(0);
  });

  test("horizontal step labels do not collide", async ({ page }) => {
    await page.goto("components/steps");
    const list = page.getByRole("list", { name: "Progress steps" }).first();
    const names = ["Scrutineering", "Free Practice", "Qualifying", "Warm-up", "Race"];
    const boxes = await Promise.all(
      names.map((name) => boxOf(list.getByText(name, { exact: true })))
    );
    const scrutineering = boxes[0];
    const race = boxes[boxes.length - 1];
    if (scrutineering && race) {
      expect(scrutineering.height).toBeLessThanOrEqual(race.height + 4);
    }
    const inkOverflows = await list.evaluate((root) =>
      [...root.querySelectorAll("span")].some((el) => el.scrollWidth > el.clientWidth + 1)
    );
    expect(inkOverflows).toBe(false);
    for (let i = 0; i < boxes.length - 1; i++) {
      const current = boxes[i];
      const next = boxes[i + 1];
      if (current && next) expect(horizontalOverlap(current, next)).toBeLessThanOrEqual(1);
    }
    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);
  });

  test("large segmented control scrolls inside the column", async ({ page }) => {
    await page.goto("components/segmented-control");
    const segment = page.getByRole("radio", { name: "Segment C" }).first();
    const track = segment.locator("xpath=ancestor::*[@role='radiogroup']");
    await track.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const box = await boxOf(segment);
    const main = await boxOf(page.locator("#main-content"));
    expect(box.x).toBeGreaterThanOrEqual(main.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(main.x + main.width + 1);

    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);
    expect(overflow.doc).toBeLessThanOrEqual(1);
    expect(overflow.mainScrollLeft).toBe(0);
  });

  test("accent toasts stack evenly on an opaque surface", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("components/toast");
    const trigger = page.getByRole("button", { name: "Accent (6s)" });
    for (let i = 0; i < 5; i++) await trigger.click();

    await page.waitForFunction(() => {
      const nodes = [...document.querySelectorAll("p")]
        .filter((node) => node.textContent === "Launch control armed")
        .map((node) => node.parentElement?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => rect != null);
      if (nodes.length !== 5) return false;
      nodes.sort((a, b) => a.top - b.top);
      const lefts = nodes.map((rect) => Math.round(rect.left));
      if (Math.max(...lefts) - Math.min(...lefts) > 2) return false;
      for (let i = 0; i < nodes.length - 1; i++) {
        const current = nodes[i];
        const next = nodes[i + 1];
        if (!current || !next) return false;
        if (current.bottom > next.top + 1) return false;
        const gap = next.top - current.bottom;
        if (gap < 4 || gap > 16) return false;
      }
      return true;
    });

    const paint = await page
      .getByText("Launch control armed")
      .first()
      .evaluate((el) => {
        const node = el.parentElement;
        if (!node) throw new Error("toast missing");
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, filter: style.backdropFilter };
      });
    expect(paint.filter).toBe("none");
    expect(parseColor(paint.background).a).toBe(1);

    const covered = await page
      .getByText("Launch control armed")
      .first()
      .evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + 24, rect.y + rect.height / 2);
        return el.parentElement?.contains(hit ?? null) ?? false;
      });
    expect(covered).toBe(true);
  });
});

test.describe("desktop light mode", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, "light");
    }, THEME_KEY);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("keeps the wide layouts and the light command palette glass", async ({ page }) => {
    await page.goto("components/breadcrumb");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const deep = page.getByRole("navigation", { name: "Deep path" });
    const home = await boxOf(deep.getByRole("link", { name: "Home" }));
    const lap = await boxOf(deep.getByText("Lap 14", { exact: true }));
    expect(Math.abs(home.y - lap.y)).toBeLessThanOrEqual(2);

    await page.goto("components/date-range");
    const day = await boxOf(page.locator("[data-date='2026-07-15']").first());
    expect(day.width).toBeGreaterThanOrEqual(33);
    expect(day.width).toBeLessThanOrEqual(35);

    await page.goto("components/pagination");
    const large = page.getByRole("navigation", { name: "Large range with ellipsis pagination" });
    await expect(large).not.toHaveAttribute("data-overflowing", "true");
    const overflow = await horizontalOverflow(page);
    expect(overflow.main).toBeLessThanOrEqual(1);

    await page.goto("components/command-palette");
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const background = await page
      .getByRole("dialog", { name: "Command palette" })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).toBe("rgba(253, 252, 250, 0.85)");
  });
});
