/**
 * Layout bugs reproduced on the live showcase at a 768px viewport with the
 * sidebar still open (it collapses at 767px). Dark mode is the reported
 * theme; light mode and a desktop width are checked so the fixes do not
 * trade one viewport for another.
 */
import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page, path: string, scheme: "dark" | "light") {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: scheme });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
}

function fullyInside(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number }
) {
  expect(inner.width).toBeGreaterThan(0);
  expect(inner.height).toBeGreaterThan(0);
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1);
}

test.describe("checkout order summary", () => {
  for (const scheme of ["dark", "light"] as const) {
    test(`shows every price inside the summary at 768px (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 900 });
      await ready(page, "examples/checkout", scheme);

      const summary = page.getByRole("heading", { name: "Order summary" });
      const card = summary.locator("xpath=ancestor::*[.//dl][1]");
      const price = card.locator("dd", { hasText: "$1,740.00" });
      const label = card.locator("dt", { hasText: "Suite 402 · 3 nights" });

      const cardBox = await card.boundingBox();
      const priceBox = await price.boundingBox();
      const labelBox = await label.boundingBox();
      expect(cardBox).toBeTruthy();
      expect(priceBox).toBeTruthy();
      expect(labelBox).toBeTruthy();
      fullyInside(priceBox!, cardBox!);
      fullyInside(labelBox!, cardBox!);
      expect(priceBox!.width).toBeGreaterThan(40);
      // The zero-width price used to wrap one glyph per line and stretch the card past 1000px.
      expect(cardBox!.height).toBeLessThan(700);
      expect(cardBox!.width).toBeGreaterThan(240);

      const clipped = await label.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clipped).toBe(false);
    });
  }

  test("keeps summary and payment side by side at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await ready(page, "examples/checkout", "light");
    const summary = await page
      .getByRole("heading", { name: "Order summary" })
      .locator("xpath=ancestor::*[.//dl][1]")
      .boundingBox();
    const payment = await page
      .getByRole("heading", { name: "Payment details" })
      .locator("xpath=ancestor::*[self::div][1]")
      .boundingBox();
    expect(summary && payment).toBeTruthy();
    expect(payment!.x).toBeGreaterThan(summary!.x + summary!.width - 8);
    expect(Math.abs(summary!.y - payment!.y)).toBeLessThan(40);
  });
});

test.describe("booking wizard date picker", () => {
  test("anchors the calendar under the field and accepts a mouse date at 768px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await ready(page, "examples/booking-wizard", "dark");

    const checkIn = page.getByRole("combobox", { name: "Check-in" });
    const checkOut = page.getByRole("combobox", { name: "Check-out" });
    const inBox = await checkIn.boundingBox();
    const outBox = await checkOut.boundingBox();
    expect(inBox && outBox).toBeTruthy();
    // Two columns at this width clipped "Nov 20, 2026". They stack instead.
    expect(outBox!.y).toBeGreaterThan(inBox!.y + inBox!.height - 4);

    await checkIn.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Positioning is written in a layout effect and again on scroll, so wait
    // until the panel actually overlaps the field before measuring the gap.
    await expect
      .poll(async () => {
        const field = await checkIn.boundingBox();
        const panel = await dialog.boundingBox();
        if (!field || !panel) return false;
        return panel.x < field.x + field.width && panel.x + panel.width > field.x;
      })
      .toBe(true);
    const field = await checkIn.boundingBox();
    const panel = await dialog.boundingBox();
    expect(field && panel).toBeTruthy();
    const viewport = page.viewportSize()!;
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.y).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height);
    // Anchored to the field: overlaps it horizontally and sits just below or just above.
    expect(panel!.x).toBeLessThan(field!.x + field!.width);
    expect(panel!.x + panel!.width).toBeGreaterThan(field!.x);
    const gapBelow = panel!.y - (field!.y + field!.height);
    const gapAbove = field!.y - (panel!.y + panel!.height);
    expect((gapBelow >= -8 && gapBelow < 24) || (gapAbove >= -8 && gapAbove < 24)).toBe(true);

    await expect(dialog.getByRole("gridcell").first()).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole("gridcell").last()).toBeInViewport({ ratio: 1 });

    const day = dialog.locator('[role="gridcell"]:not([aria-disabled="true"])').nth(8);
    await day.click();
    await expect(dialog).toBeHidden();
    await expect(checkIn).not.toHaveValue("");
    const clips = await checkIn.evaluate(
      (el: HTMLInputElement) => el.scrollWidth > el.clientWidth + 1
    );
    expect(clips).toBe(false);
  });

  test("keeps the two date fields side by side at 1280px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await ready(page, "examples/booking-wizard", "light");
    const checkIn = await page.getByRole("combobox", { name: "Check-in" }).boundingBox();
    const checkOut = await page.getByRole("combobox", { name: "Check-out" }).boundingBox();
    expect(checkIn && checkOut).toBeTruthy();
    expect(checkOut!.x).toBeGreaterThan(checkIn!.x + checkIn!.width - 8);
    expect(Math.abs(checkIn!.y - checkOut!.y)).toBeLessThan(8);
  });
});

test.describe("onboarding property name", () => {
  test("refuses a blank or whitespace name and accepts a trimmed one", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await ready(page, "examples/onboarding", "dark");

    const name = page.getByLabel("Property name");
    await name.fill("");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Tell us about your property" })).toBeVisible();
    await expect(page.getByText("Property name is required.")).toBeVisible();

    await name.fill("   ");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Tell us about your property" })).toBeVisible();

    await name.fill("  Cedar Lodge  ");
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Set up your spaces" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(
      page.getByRole("heading", { name: "You're ready to take bookings" })
    ).toBeVisible();
    await expect(page.getByText("Cedar Lodge")).toBeVisible();
    await expect(page.getByText("Property name is required.")).toHaveCount(0);
  });
});

test.describe("notification rows", () => {
  for (const width of [768, 1280]) {
    test(`keeps title, body, and timestamp inside the row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await ready(page, "examples/notification-center", width === 768 ? "dark" : "light");

      const row = page.getByRole("button", { name: /New reservation confirmed/ });
      await expect(row).toBeVisible();
      const title = row.getByText("New reservation confirmed", { exact: true });
      const body = row.getByText(/Elena Marchetti booked/);
      const time = row.getByText(/ago|yesterday/);

      const rowBox = await row.boundingBox();
      const titleBox = await title.boundingBox();
      const bodyBox = await body.boundingBox();
      const timeBox = await time.boundingBox();
      expect(rowBox && titleBox && bodyBox && timeBox).toBeTruthy();
      expect(bodyBox!.y).toBeGreaterThanOrEqual(titleBox!.y + titleBox!.height - 2);
      fullyInside(titleBox!, rowBox!);
      fullyInside(bodyBox!, rowBox!);
      fullyInside(timeBox!, rowBox!);

      const viewport = page.viewportSize()!;
      expect(timeBox!.x + timeBox!.width).toBeLessThanOrEqual(viewport.width);
    });
  }
});
