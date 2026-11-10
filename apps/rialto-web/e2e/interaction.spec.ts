import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Button page — clicking a button triggers visual feedback", async ({ page }) => {
  // Relative navigation — an absolute path would drop the /rialto/ base
  // from the configured baseURL and 404 against the dev server's hint page.
  await page.goto("components/button");
  await page.waitForLoadState("networkidle");

  const button = page.getByRole("button", { name: /primary/i }).first();
  await expect(button).toBeVisible();
  await button.click();
});

test("Input page — typing in an input updates the value", async ({ page }) => {
  await page.goto("components/input");
  await page.waitForLoadState("networkidle");

  const input = page.getByRole("textbox").first();
  await expect(input).toBeVisible();
  await input.fill("Hello Rialto");
  await expect(input).toHaveValue("Hello Rialto");
});

test("Toggle page — clicking a toggle switches state", async ({ page }) => {
  await page.goto("components/toggle");
  await page.waitForLoadState("networkidle");

  const toggle = page.getByRole("switch").first();
  await expect(toggle).toBeVisible();
  const wasChecked = await toggle.isChecked();
  // Rialto's Toggle renders the native input visually-hidden (sr-only) with a
  // styled track/knob overlaying it, so Playwright's pointer click can't land
  // on the input itself. Click the visible track label instead (associated
  // via htmlFor) — a real user click, not a bypassed dispatchEvent, so this
  // still fails if a CSS regression makes the track unclickable.
  const toggleId = await toggle.getAttribute("id");
  await page.locator(`label[for="${toggleId}"]`).first().click();
  const isNowChecked = await toggle.isChecked();
  expect(isNowChecked).toBe(!wasChecked);
});

test("Select page — opening a select shows options", async ({ page }) => {
  await page.goto("components/select");
  await page.waitForLoadState("networkidle");

  const trigger = page.getByRole("combobox").first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
});

async function consent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  });
}

test("Select page — Tyre Compound and Race Strategy keep the picked option", async ({ page }) => {
  await consent(page);
  await page.goto("components/select");
  await page.waitForLoadState("networkidle");

  const tyre = page.getByRole("combobox", { name: "Tyre Compound" });
  await tyre.click();
  await page.getByRole("option", { name: "Medium (C3)" }).click();
  await expect(tyre).toContainText("Medium (C3)");

  await tyre.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(tyre).toContainText("Hard (C1)");

  const starting = page.getByRole("combobox", { name: "Starting tyre" });
  const pit = page.getByRole("combobox", { name: "Pit window" });
  await starting.click();
  await page.getByRole("option", { name: "Hard (C1)" }).click();
  await pit.click();
  await page.getByRole("option", { name: "Lap 20–25" }).click();
  await expect(starting).toContainText("Hard (C1)");
  await expect(pit).toContainText("Lap 20–25");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(starting).toContainText("Select compound…");
  await expect(pit).toContainText("Select lap…");
  await expect(tyre).toContainText("Hard (C1)");
});

test("Number input page — pit strategy steps inside its bounds and Reset restores defaults", async ({
  page,
}) => {
  await consent(page);
  await page.goto("components/number-input");
  await page.waitForLoadState("networkidle");

  const target = page.getByLabel("Target Lap");
  const fuel = page.getByLabel("Fuel Load (kg)");
  await expect(target).toHaveValue("14");
  await expect(fuel).toHaveValue("45");

  await target.locator("xpath=..").getByRole("button", { name: "Increase" }).click();
  await expect(target).toHaveValue("15");
  await target.focus();
  await page.keyboard.press("ArrowUp");
  await expect(target).toHaveValue("16");

  await fuel.focus();
  await page.keyboard.press("ArrowDown");
  await expect(fuel).toHaveValue("44.5");

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(target).toHaveValue("14");
  await expect(fuel).toHaveValue("45");

  await page.getByLabel("Lap Count").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByLabel("Lap Count")).toHaveValue("6");
});

async function glyphIsVisible(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  const svg = button.locator("svg");
  const box = await svg.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(8);
  expect(box!.height).toBeGreaterThan(8);

  const paint = await svg.evaluate((el) => {
    const path = el.querySelector("path, line, polyline, circle");
    const stroke = path ? getComputedStyle(path).stroke : "";
    const background = getComputedStyle(el.closest("button")!).backgroundColor;
    return { stroke, background };
  });
  expect(paint.stroke).not.toBe("none");
  expect(paint.stroke).not.toBe("rgba(0, 0, 0, 0)");
  expect(paint.stroke.replace(/\s/g, "")).not.toBe(paint.background.replace(/\s/g, ""));
}

test("Tooltip page — icon triggers paint a glyph in light and dark", async ({ page }) => {
  await consent(page);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
    await page.goto("components/tooltip");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);

    for (const name of ["Upload", "Download", "Delete"]) {
      await glyphIsVisible(page, name);
    }

    const upload = page.getByRole("button", { name: "Upload", exact: true });
    await upload.hover();
    await expect(page.getByRole("tooltip")).toContainText("Upload telemetry");
    await upload.blur();
  }
});

test("Checkbox page — checking a checkbox toggles its state", async ({ page }) => {
  await page.goto("components/checkbox-radio");
  await page.waitForLoadState("networkidle");

  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).toBeVisible();
  const wasChecked = await checkbox.isChecked();
  // Same sr-only-input pattern as Toggle above — click the visible label
  // (box + text) that wraps the input via htmlFor, instead of bypassing
  // actionability checks with dispatchEvent.
  const checkboxId = await checkbox.getAttribute("id");
  await page.locator(`label[for="${checkboxId}"]`).first().click();
  const isNowChecked = await checkbox.isChecked();
  expect(isNowChecked).toBe(!wasChecked);
});

test("TapeChart page — overlapping bars are both clickable (no occlusion)", async ({ page }) => {
  await page.goto("components/tape-chart");
  await page.waitForLoadState("networkidle");
  const chart = page.getByTestId("tape-chart-overlaps-default");
  const card = page.getByTestId("tape-chart-overlaps-selection-default");
  const first = chart.getByRole("button", { name: /Marisol Vega/ });
  const second = chart.getByRole("button", { name: /Tobias Lindqvist/ });
  await expect(first).toHaveAttribute("data-lane", "0");
  await expect(second).toHaveAttribute("data-lane", "1");
  await expect(first).toHaveAttribute("data-overlap", "conflict");
  await first.click(); // actionability check fails with "intercepts pointer events" if covered
  await expect(card).toContainText("Marisol Vega");
  await second.click();
  await expect(card).toContainText("Tobias Lindqvist");
  const dormBar = page
    .getByTestId("tape-chart-overlaps-classified")
    .getByRole("button", { name: /Oscar Delacroix/ });
  await expect(dormBar).toHaveAttribute("data-overlap", "shared");
});

test("TapeChart page — each Overlaps chart reports its own rule", async ({ page }) => {
  await page.goto("components/tape-chart");
  await page.waitForLoadState("networkidle");
  const defaultChart = page.getByTestId("tape-chart-overlaps-default");
  const classifiedChart = page.getByTestId("tape-chart-overlaps-classified");
  const defaultCard = page.getByTestId("tape-chart-overlaps-selection-default");
  const classifiedCard = page.getByTestId("tape-chart-overlaps-selection-classified");

  // Same dorm bunk, two charts: red under the default rule, calm under the dorm rule.
  const defaultDormBar = defaultChart.getByRole("button", { name: /Oscar Delacroix/ });
  await expect(defaultDormBar).toHaveAttribute("data-overlap", "conflict");
  await defaultDormBar.click();
  await expect(defaultCard).toContainText("Double-booked");
  await expect(classifiedCard).toHaveCount(0);

  await classifiedChart.getByRole("button", { name: /Oscar Delacroix/ }).click();
  await expect(classifiedCard).toContainText("Shared occupancy");
  await expect(defaultCard).toContainText("Double-booked");
});

/* ── Dialog: scrolling body, nested popover, short viewports (#7994 review) ── */

test.describe("Dialog layout", () => {
  const openDialog = async (page: Page, trigger: string) => {
    await page.goto("components/dialog");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: trigger }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  };

  test("a long body scrolls from the keyboard and passes axe scrollable-region-focusable", async ({
    page,
  }) => {
    const dialog = await openDialog(page, "Long Content Dialog");
    const body = dialog.getByRole("region", { name: "Scrollable content" });
    expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    const { violations } = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withRules(["scrollable-region-focusable"])
      .analyze();
    expect(violations).toEqual([]);

    // Initial focus stays on the first action, not the scroller; one Shift+Tab
    // reaches the body, where PageDown scrolls it.
    await expect(dialog.getByRole("button", { name: "Dismiss" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(body).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("a dialog that fits adds no tab stop", async ({ page }) => {
    const dialog = await openDialog(page, "Open Dialog");
    await expect(dialog.locator('[tabindex="0"]')).toHaveCount(0);
  });

  test("a DatePicker day grid is fully visible when opened inside a dialog", async ({ page }) => {
    const dialog = await openDialog(page, "Session Settings");
    await dialog.getByLabel("Session Date").click();
    const grid = page.getByRole("dialog", { name: "Popover" }).getByRole("grid");
    await expect(grid).toBeVisible();
    // Not clipped by the dialog body: first and last day cells are fully in the
    // viewport, and the popover is lifted out of the dialog's scroller.
    await expect(grid.getByRole("gridcell").first()).toBeInViewport({ ratio: 1 });
    await expect(grid.getByRole("gridcell").last()).toBeInViewport({ ratio: 1 });
    expect(await grid.evaluate((el) => el.closest('[role="dialog"] [role="region"]'))).toBeNull();
  });

  test("footer actions stay reachable at the 320x256 reflow size", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    const dialog = await openDialog(page, "Open Dialog");
    await expect(dialog.getByRole("button", { name: "Confirm" })).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeInViewport({
      ratio: 1,
    });
  });

  test("a very long description scrolls and keeps the footer in view on a phone", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const dialog = await openDialog(page, "Open Dialog");
    await dialog.evaluate((el) => {
      const p = el.querySelector("p");
      if (p) p.textContent = "A long sentence about what happens next. ".repeat(60);
    });
    await expect(dialog.getByRole("button", { name: "Confirm" })).toBeInViewport({ ratio: 1 });
  });

  test("a max-height dialog paints above the sticky site header", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    const dialog = await openDialog(page, "Long Content Dialog");
    await page.evaluate(() => document.fonts.ready);

    const covered = await dialog.evaluate((el) => {
      const dialogBox = el.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="Global navigation"]');
      const navBox = nav?.getBoundingClientRect();
      if (!navBox || dialogBox.top >= navBox.bottom) {
        return { samples: 0, allInDialog: false, top: dialogBox.top, navBottom: navBox?.bottom };
      }
      const hits: boolean[] = [];
      for (let y = dialogBox.top + 1; y < navBox.bottom; y += 4) {
        const node = document.elementFromPoint(dialogBox.left + dialogBox.width / 2, y);
        hits.push(Boolean(node?.closest('[role="dialog"]')));
      }
      return {
        samples: hits.length,
        allInDialog: hits.every(Boolean),
        top: dialogBox.top,
        navBottom: navBox.bottom,
      };
    });

    expect(covered.top).toBeLessThan(covered.navBottom ?? 0);
    expect(covered.samples).toBeGreaterThan(0);
    expect(covered.allInDialog).toBe(true);
    await expect(dialog.getByRole("heading", { name: "Technical Regulations" })).toBeInViewport({
      ratio: 1,
    });
  });
});

function colorAlpha(color: string): number {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match?.[1]) return 1;
  const parts = match[1].split(",").map((part) => part.trim());
  const alpha = parts[3];
  return alpha === undefined ? 1 : Number(alpha);
}

test("combobox empty listbox is opaque in dark mode", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mbe-theme-preference", "dark");
    localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("components/combobox");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const fruit = page.getByRole("combobox", { name: "Fruit" }).first();
  await fruit.click();
  const openList = page.getByRole("listbox");
  await expect(openList.getByRole("option").first()).toBeVisible();
  const resultsAlpha = await openList.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(colorAlpha(resultsAlpha)).toBe(1);

  await fruit.fill("zzz");
  const emptyList = page.getByRole("listbox");
  await expect(emptyList.getByText("No results")).toBeVisible();
  const empty = await emptyList.evaluate((el) => {
    const style = getComputedStyle(el);
    return { backgroundColor: style.backgroundColor, backdropFilter: style.backdropFilter };
  });
  expect(colorAlpha(empty.backgroundColor)).toBe(1);
  expect(empty.backdropFilter).toBe("none");
});

test("combobox empty listbox stays a light surface in light mode", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mbe-theme-preference", "light");
    localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("components/combobox");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const fruit = page.getByRole("combobox", { name: "Fruit" }).first();
  await fruit.fill("zzz");
  const emptyList = page.getByRole("listbox");
  await expect(emptyList.getByText("No results")).toBeVisible();
  const background = await emptyList.evaluate((el) => getComputedStyle(el).backgroundColor);
  // Dark glass is rgb(42 39 37 / 0.9). Light mode must not inherit that fill.
  expect(background).not.toBe("rgba(42, 39, 37, 0.9)");
  expect(colorAlpha(background)).toBeGreaterThan(0);
});
