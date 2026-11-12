import { test, expect, type Page } from "@playwright/test";

/**
 * The live demo pages at 375×676 in light mode: the display bar covered
 * content because it was position:fixed, select menus were a translucent
 * glass fill with no backdrop blur, and telemetry / dashboard / drivers
 * grew wider than the viewport.
 */

const THEME_KEY = "mbe-theme-preference";

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(background: string): Rgb {
  const match = background.match(/rgba?\(([^)]+)\)/);
  if (!match?.[1]) throw new Error(`unparsed color: ${background}`);
  const parts = match[1].split(",").map((part) => Number(part.trim()));
  return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
}

async function documentWidth(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

async function consentAndTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript(
    ({ key, theme: stored }) => {
      localStorage.setItem(key, stored);
      localStorage.setItem(
        "rialto-cookie-consent",
        JSON.stringify({
          consented: true,
          preferences: { essential: true, analytics: true, functional: true, marketing: true },
        })
      );
    },
    { key: THEME_KEY, theme }
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function openEngineList(page: Page) {
  await page.goto("demos/teams/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Team Name").fill("Scuderia");
  await page.getByLabel("Base City").fill("Maranello");
  await page.getByLabel("Team Principal").fill("Fred");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("combobox", { name: "Engine Supplier" }).click();
  const list = page.getByRole("listbox", { name: "Engine Supplier" });
  await expect(list).toBeVisible();
  return list;
}

const NARROW_PAGES = [
  { path: "demos/telemetry?frozen=1", label: "telemetry" },
  { path: "demos/dashboard", label: "dashboard" },
  { path: "demos/drivers", label: "drivers" },
] as const;

test.describe("narrow demo pages", () => {
  test.use({ viewport: { width: 375, height: 676 } });

  test.beforeEach(async ({ page }) => {
    await consentAndTheme(page, "light");
  });

  for (const { path, label } of NARROW_PAGES) {
    test(`${label} document is no wider than 375px`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      if (label === "dashboard") await page.getByRole("tab", { name: "Speed Data" }).waitFor();
      expect(await documentWidth(page)).toBeLessThanOrEqual(375);
    });
  }

  test("the drivers table scrolls inside its own frame", async ({ page }) => {
    await page.goto("demos/drivers");
    await page.waitForLoadState("networkidle");
    const frame = await page
      .getByRole("table")
      .first()
      .evaluate((el) => {
        const wrap = el.parentElement;
        if (!wrap) throw new Error("table frame missing");
        const box = wrap.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          scrolls: wrap.scrollWidth > wrap.clientWidth + 1,
        };
      });
    expect(frame.left).toBeGreaterThanOrEqual(-1);
    expect(frame.right).toBeLessThanOrEqual(376);
    expect(frame.scrolls).toBe(true);
    expect(await documentWidth(page)).toBeLessThanOrEqual(375);
  });

  test("the speed data card stays inside the viewport", async ({ page }) => {
    await page.goto("demos/dashboard");
    await page.getByRole("tab", { name: "Speed Data" }).waitFor();
    const right = await page.getByRole("tab", { name: "Speed Data" }).evaluate((el) => {
      let node = el.parentElement;
      while (node && node.id !== "main-content") {
        const style = getComputedStyle(node);
        if (parseFloat(style.borderTopWidth) > 0 && style.borderRadius !== "0px") {
          return node.getBoundingClientRect().right;
        }
        node = node.parentElement;
      }
      throw new Error("speed data card missing");
    });
    expect(right).toBeLessThanOrEqual(375);
    expect(await documentWidth(page)).toBeLessThanOrEqual(375);
  });

  test("the telemetry switch and zone table stay inside the HUD", async ({ page }) => {
    await page.goto("demos/telemetry?frozen=1");
    await page.waitForLoadState("networkidle");
    const edges = await page.getByRole("radio", { name: "Game" }).evaluate((el) => {
      const hud = el.closest("[data-feed-state]");
      const table = hud?.querySelector("table");
      if (!hud || !table) throw new Error("telemetry frame missing");
      const frame = hud.getBoundingClientRect();
      const control = el.getBoundingClientRect();
      const grid = table.getBoundingClientRect();
      return {
        frameRight: frame.right,
        frameLeft: frame.left,
        controlRight: control.right,
        gridRight: grid.right,
      };
    });
    expect(edges.controlRight).toBeLessThanOrEqual(edges.frameRight + 1);
    expect(edges.gridRight).toBeLessThanOrEqual(edges.frameRight + 1);
    expect(edges.frameLeft).toBeGreaterThanOrEqual(-1);
    expect(edges.frameRight).toBeLessThanOrEqual(375);
    expect(await documentWidth(page)).toBeLessThanOrEqual(375);
  });

  test("display controls do not cover the team steps after Next", async ({ page }) => {
    await page.goto("demos/teams/new");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Team Name").fill("Scuderia");
    await page.getByLabel("Base City").fill("Maranello");
    await page.getByLabel("Team Principal").fill("Fred");
    await page.getByRole("button", { name: "Next" }).click();
    const steps = page.getByRole("list", { name: "Progress steps" });
    await expect(steps).toBeVisible();
    const covered = await steps.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const controls = document.querySelector("[data-testid='demo-floating-controls']");
      const hit = document.elementFromPoint(rect.left + 28, rect.top + 10);
      return Boolean(controls?.contains(hit));
    });
    expect(covered).toBe(false);
  });

  test("display controls scroll with the page instead of covering the auth diagram", async ({
    page,
  }) => {
    await page.goto("demos/auth-flow");
    await page.waitForLoadState("networkidle");
    const controls = page.getByTestId("demo-floating-controls");
    const before = await controls.boundingBox();
    expect(before).not.toBeNull();
    await page.evaluate(() => window.scrollTo(0, 280));
    const after = await controls.boundingBox();
    expect(after === null || after.y < before!.y - 100).toBe(true);

    const diagram = page.getByRole("region", { name: "OIDC flow diagram" });
    await diagram.scrollIntoViewIfNeeded();
    const covered = await diagram.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const bar = document.querySelector("[data-testid='demo-floating-controls']");
      const y = Math.min(Math.max(rect.top + 12, 0), window.innerHeight - 1);
      const hit = document.elementFromPoint(rect.left + 24, y);
      return Boolean(bar?.contains(hit));
    });
    expect(covered).toBe(false);
  });

  test("engine supplier listbox is an opaque elevated surface", async ({ page }) => {
    const list = await openEngineList(page);
    const paint = await list.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, filter: style.backdropFilter };
    });
    expect(paint.filter).toBe("none");
    expect(parseColor(paint.background)).toEqual({ r: 253, g: 252, b: 250, a: 1 });
  });
});

test.describe("narrow demo pages in dark mode", () => {
  test.use({ viewport: { width: 375, height: 676 } });

  test.beforeEach(async ({ page }) => {
    await consentAndTheme(page, "dark");
  });

  test("engine supplier listbox stays opaque", async ({ page }) => {
    const list = await openEngineList(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const paint = await list.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, filter: style.backdropFilter };
    });
    expect(paint.filter).toBe("none");
    expect(parseColor(paint.background)).toEqual({ r: 42, g: 39, b: 37, a: 1 });
  });

  test("drivers and telemetry stay within 375px", async ({ page }) => {
    await page.goto("demos/drivers");
    await page.waitForLoadState("networkidle");
    expect(await documentWidth(page)).toBeLessThanOrEqual(375);
    await page.goto("demos/telemetry?frozen=1");
    await page.waitForLoadState("networkidle");
    expect(await documentWidth(page)).toBeLessThanOrEqual(375);
  });
});

test.describe("desktop demo pages", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await consentAndTheme(page, "light");
  });

  test("wide layouts do not scroll sideways and the telemetry switch stays on one row", async ({
    page,
  }) => {
    await page.goto("demos/telemetry?frozen=1");
    await page.waitForLoadState("networkidle");
    const live = await page.getByText("LIVE", { exact: true }).boundingBox();
    const game = await page.getByRole("radio", { name: "Game" }).boundingBox();
    expect(live).not.toBeNull();
    expect(game).not.toBeNull();
    expect(Math.abs(live!.y - game!.y)).toBeLessThanOrEqual(8);
    expect(await documentWidth(page)).toBeLessThanOrEqual(1280);

    await page.goto("demos/drivers");
    await page.waitForLoadState("networkidle");
    expect(await documentWidth(page)).toBeLessThanOrEqual(1280);

    await page.goto("demos/dashboard");
    await page.getByRole("tab", { name: "Speed Data" }).waitFor();
    expect(await documentWidth(page)).toBeLessThanOrEqual(1280);
  });
});
