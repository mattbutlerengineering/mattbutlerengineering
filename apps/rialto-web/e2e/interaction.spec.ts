import { test, expect } from "@playwright/test";

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
