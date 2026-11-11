import { expect, test, type Page } from "@playwright/test";

/**
 * The date picker on /components/date-picker at 375px opened upward through
 * the page title on a translucent glass panel. The month must sit under the
 * field, on an opaque surface, in light and dark, without covering the title.
 * A desktop width keeps the same placement.
 */

async function openEventDate(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("components/date-picker");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox", { name: "Event date" }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  return panel;
}

function alphaOf(color: string): number {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return 1;
  const parts = (match[1] ?? "").split(",").map((part) => Number.parseFloat(part.trim()));
  return parts.length === 4 ? (parts[3] ?? 1) : 1;
}

test.describe("date picker at 375px", () => {
  test("opens an opaque month under the field in light mode", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const panel = await openEventDate(page);
    const heading = page.getByRole("heading", { name: "Date Picker", level: 1 });
    const field = page.getByRole("combobox", { name: "Event date" });

    const boxes = await Promise.all([
      panel.boundingBox(),
      field.boundingBox(),
      heading.boundingBox(),
    ]);
    const [panelBox, fieldBox, headingBox] = boxes;
    expect(panelBox).not.toBeNull();
    expect(fieldBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    if (!panelBox || !fieldBox || !headingBox) return;

    expect(panelBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);
    expect(panelBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height - 1);
    // Subpixel borders can land the panel a fraction past the viewport edge.
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(812 + 2);
    expect(headingBox.x).toBeGreaterThanOrEqual(40);

    const background = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(background)).toBe(1);
    expect(background).not.toMatch(/0\.85/);

    await panel.getByRole("gridcell", { name: "20" }).click();
    await expect(panel).toBeHidden();
    await expect(field).toHaveValue(/Jul 20, 2026/);
  });

  test("keeps the month under the field on a short phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const panel = await openEventDate(page);
    const heading = page.getByRole("heading", { name: "Date Picker", level: 1 });
    const field = page.getByRole("combobox", { name: "Event date" });
    const panelBox = await panel.boundingBox();
    const fieldBox = await field.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(panelBox && fieldBox && headingBox).toBeTruthy();
    if (!panelBox || !fieldBox || !headingBox) return;

    expect(panelBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(667 + 2);
    const overlapsHeading =
      panelBox.y < headingBox.y + headingBox.height && panelBox.y + panelBox.height > headingBox.y;
    expect(overlapsHeading).toBe(false);

    const background = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(background)).toBe(1);
  });

  test("opens an opaque month under the field in dark mode", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await page.goto("components/date-picker");
    await page.waitForLoadState("networkidle");
    const toggle = page.getByRole("button", { name: "Switch to dark mode" });
    if (await toggle.isVisible()) await toggle.click();
    await page.getByRole("combobox", { name: "Event date" }).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    const field = page.getByRole("combobox", { name: "Event date" });
    const panelBox = await panel.boundingBox();
    const fieldBox = await field.boundingBox();
    expect(panelBox && fieldBox).toBeTruthy();
    if (!panelBox || !fieldBox) return;
    expect(panelBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);

    const background = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(background)).toBe(1);
    expect(background).toMatch(/rgb\(\s*42,\s*39,\s*37\s*\)/);
  });

  test("stays under the field at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const panel = await openEventDate(page);
    const field = page.getByRole("combobox", { name: "Event date" });
    const heading = page.getByRole("heading", { name: "Date Picker", level: 1 });
    const panelBox = await panel.boundingBox();
    const fieldBox = await field.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(panelBox && fieldBox && headingBox).toBeTruthy();
    if (!panelBox || !fieldBox || !headingBox) return;

    expect(panelBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);
    expect(panelBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height - 1);
    const background = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(background)).toBe(1);
  });
});
