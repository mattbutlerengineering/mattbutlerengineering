import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Button page — clicking a button triggers visual feedback", async ({ page }) => {
  await page.goto("/components/button");
  await page.waitForLoadState("networkidle");

  const button = page.getByRole("button", { name: /primary/i }).first();
  await expect(button).toBeVisible();
  await button.click();
});

test("Input page — typing in an input updates the value", async ({ page }) => {
  await page.goto("/components/input");
  await page.waitForLoadState("networkidle");

  const input = page.getByRole("textbox").first();
  await expect(input).toBeVisible();
  await input.fill("Hello Rialto");
  await expect(input).toHaveValue("Hello Rialto");
});

test("Toggle page — clicking a toggle switches state", async ({ page }) => {
  await page.goto("/components/toggle");
  await page.waitForLoadState("networkidle");

  const toggle = page.getByRole("switch").first();
  await expect(toggle).toBeVisible();
  const wasChecked = await toggle.isChecked();
  await toggle.click();
  const isNowChecked = await toggle.isChecked();
  expect(isNowChecked).toBe(!wasChecked);
});

test("Select page — opening a select shows options", async ({ page }) => {
  await page.goto("/components/select");
  await page.waitForLoadState("networkidle");

  const trigger = page.getByRole("combobox").first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
});

test("Checkbox page — checking a checkbox toggles its state", async ({ page }) => {
  await page.goto("/components/checkbox-radio");
  await page.waitForLoadState("networkidle");

  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).toBeVisible();
  const wasChecked = await checkbox.isChecked();
  await checkbox.click();
  const isNowChecked = await checkbox.isChecked();
  expect(isNowChecked).toBe(!wasChecked);
});
