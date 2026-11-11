import { test, expect, type Locator, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "rialto-cookie-consent",
      JSON.stringify({
        consented: true,
        preferences: { essential: true, analytics: true, functional: true, marketing: true },
      })
    );
  });
});

/** The element under the point is the target, or inside it. */
async function isHit(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + 8, rect.top + rect.height / 2);
    return hit !== null && (hit === el || el.contains(hit));
  });
}

async function pickOption(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("team review keeps a long unbreakable value inside the card", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("demos/teams/new");
  await page.waitForLoadState("networkidle");

  const city = "A".repeat(300);
  const principal = "P".repeat(300);
  const chassis = "C".repeat(300);

  await page.getByLabel("Team Name").fill("Team QA");
  await page.getByLabel("Base City").fill(city);
  await page.getByLabel("Team Principal").fill(principal);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByLabel("Chassis Designation").fill(chassis);
  await pickOption(page, "Engine Supplier", "Ferrari");
  await pickOption(page, "Primary Livery Color", "Red");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  const teamList = page.locator("dl").nth(0);
  const carList = page.locator("dl").nth(1);
  const cityValue = teamList.locator("dd").nth(1);
  const principalValue = teamList.locator("dd").nth(2);
  const chassisValue = carList.locator("dd").nth(0);

  await expect(cityValue).toHaveText(city);
  await expect(principalValue).toHaveText(principal);
  await expect(chassisValue).toHaveText(chassis);

  for (const value of [cityValue, principalValue, chassisValue]) {
    const valueBox = await value.boundingBox();
    const listBox = await value.locator("xpath=ancestor::dl[1]").boundingBox();
    expect(valueBox).not.toBeNull();
    expect(listBox).not.toBeNull();
    expect(valueBox!.width).toBeLessThan(640);
    expect(valueBox!.x + valueBox!.width).toBeLessThanOrEqual(listBox!.x + listBox!.width + 1);
  }

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(pageOverflow).toBeLessThanOrEqual(1);
});

test("team car setup marks engine and livery required when they block Next", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("demos/teams/new");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Team Name").fill("Team QA");
  await page.getByLabel("Base City").fill("Maranello");
  await page.getByLabel("Team Principal").fill("A. Rossi");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  const chassis = page.getByLabel("Chassis Designation");
  const engine = page.getByRole("combobox", { name: "Engine Supplier" });
  const livery = page.getByRole("combobox", { name: "Primary Livery Color" });

  await expect(chassis).toHaveAttribute("required", "");
  await expect(engine).toHaveAttribute("aria-required", "true");
  await expect(livery).toHaveAttribute("aria-required", "true");
  await expect(page.locator("label", { hasText: "Engine Supplier" })).toContainText("*");
  await expect(page.locator("label", { hasText: "Primary Livery Color" })).toContainText("*");

  await chassis.fill("X");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByText("Please fix the following:")).toBeVisible();
  await expect(engine).toHaveAttribute("aria-invalid", "true");
  await expect(livery).toHaveAttribute("aria-invalid", "true");
  await expect(chassis).not.toHaveAttribute("aria-invalid");

  const engineDescribedBy = await engine.getAttribute("aria-describedby");
  const liveryDescribedBy = await livery.getAttribute("aria-describedby");
  expect(engineDescribedBy).toBeTruthy();
  expect(liveryDescribedBy).toBeTruthy();
  await expect(page.locator(`[id="${engineDescribedBy}"]`)).toHaveText(
    "Engine supplier is required."
  );
  await expect(page.locator(`[id="${liveryDescribedBy}"]`)).toHaveText("Livery color is required.");

  const engineBorder = await engine.evaluate((el) => getComputedStyle(el).borderColor);
  const errorColor = await page.evaluate(() => {
    const hex = getComputedStyle(document.documentElement)
      .getPropertyValue("--rialto-error")
      .trim();
    const value = hex.replace("#", "");
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
  });
  expect(engineBorder).toBe(errorColor);

  await engine.click();
  await page.getByRole("option", { name: "Ferrari", exact: true }).click();
  await expect(engine).not.toHaveAttribute("aria-invalid");
  await expect(page.getByText("Engine supplier is required.")).toHaveCount(0);
  await expect(livery).toHaveAttribute("aria-invalid", "true");
});

test("opening one mobile overlay closes the other", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("components/button");
  await page.waitForLoadState("networkidle");

  const globalNav = page.getByRole("navigation", { name: "Global navigation" });
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(globalNav.getByRole("link", { name: "Hospitality" })).toBeVisible();

  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveCount(0);
  const filter = page.getByLabel("Filter components");
  await expect(filter).toBeVisible();
  expect(await isHit(filter)).toBe(true);

  const card = page.getByRole("link", { name: "Card", exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  expect(await isHit(card)).toBe(true);

  await page.getByRole("button", { name: "Close sidebar" }).click();
  await expect(filter).toBeHidden();
  await expect(page.getByRole("button", { name: "Open sidebar" })).toBeFocused();

  await page.getByRole("button", { name: "Open sidebar" }).click();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(filter).toBeHidden();
  await expect(globalNav.getByRole("link", { name: "Design System" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveAttribute(
    "aria-expanded",
    "false"
  );
});

test("the sidebar toggle does not cover the Enabled button", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("components/button");
  await page.waitForLoadState("networkidle");

  const enabled = page.getByRole("button", { name: "Enabled" }).first();
  await enabled.scrollIntoViewIfNeeded();
  await expect(enabled).toBeVisible();
  expect(await isHit(enabled)).toBe(true);

  const toggle = page.getByRole("button", { name: "Open sidebar" });
  const toggleBox = await toggle.boundingBox();
  const enabledBox = await enabled.boundingBox();
  expect(toggleBox).not.toBeNull();
  expect(enabledBox).not.toBeNull();
  const overlaps = !(
    toggleBox!.x + toggleBox!.width <= enabledBox!.x ||
    enabledBox!.x + enabledBox!.width <= toggleBox!.x ||
    toggleBox!.y + toggleBox!.height <= enabledBox!.y ||
    enabledBox!.y + enabledBox!.height <= toggleBox!.y
  );
  expect(overlaps).toBe(false);
});

test("Escape closes the mobile sidebar and returns focus to its toggle", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("components/button");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.getByLabel("Filter components")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Filter components")).toBeHidden();
  await expect(page.getByRole("button", { name: "Open sidebar" })).toBeFocused();
});
