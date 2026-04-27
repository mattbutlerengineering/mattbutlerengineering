import { test, expect } from "./fixtures.js";

test.describe("CF-3: Walk-in creation", () => {
  test("walk-in dialog opens", async ({ authPage }) => {
    await authPage.goto("/timeline");

    await authPage.getByRole("button", { name: /walk[- ]?in/i }).click();

    await expect(authPage.getByRole("dialog")).toBeVisible();
    await expect(authPage.getByRole("heading", { name: /seat walk[- ]?in/i })).toBeVisible();
  });

  test("walk-in form has required fields", async ({ authPage }) => {
    await authPage.goto("/timeline");

    await authPage.getByRole("button", { name: /walk[- ]?in/i }).click();

    await expect(authPage.getByLabel(/party size/i)).toBeVisible();
    await expect(authPage.getByLabel(/table/i)).toBeVisible();
  });
});