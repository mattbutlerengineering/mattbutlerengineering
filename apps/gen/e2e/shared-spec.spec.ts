import { test, expect } from "./fixtures.js";
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/** Unknown spec ids answer 404, as the real API does — the suite never reaches a backend. */
async function mockSpecNotFound(page: Page): Promise<void> {
  await page.route("**/api/gen/specs/*", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not found"}' })
  );
}

test.describe("Shared Spec", () => {
  test("shows not found state for unknown ID", async ({ page }) => {
    await mockSpecNotFound(page);
    await page.goto("s/invalid-id-that-does-not-exist");
    await expect(page.getByRole("heading", { name: "Spec not found" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows Back to Gen Playground button in error state", async ({ page }) => {
    await mockSpecNotFound(page);
    await page.goto("s/invalid-id-that-does-not-exist");
    await expect(page.getByRole("button", { name: "Back to Gen Playground" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("route is public — no Sign In prompt shown", async ({ page }) => {
    await mockSpecNotFound(page);
    await page.goto("s/any-id");
    // Shared spec bypasses auth gating; the login prompt must not appear
    await expect(page.getByRole("button", { name: "Sign In" })).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("error page has no critical a11y violations", async ({ page }) => {
    await mockSpecNotFound(page);
    await page.goto("s/invalid-id-for-a11y");
    await expect(page.getByRole("heading", { name: "Spec not found" })).toBeVisible({
      timeout: 10_000,
    });
    const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).analyze();
    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(violations).toHaveLength(0);
  });
});
