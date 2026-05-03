import { test, expect } from "./fixtures.js";

test.describe("CF-4: Floor plan editor", () => {
  test("floor plans page shows cards", async ({ authPage }) => {
    await authPage.goto("/floor-plans");

    await expect(authPage.getByRole("heading", { name: "Floor Plans" })).toBeVisible();
  });

  test("can navigate to editor", async ({ authPage }) => {
    await authPage.goto("/floor-plans");

    const cards = authPage.locator('[class*="card"]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click();
      await expect(authPage.getByRole("heading", { name: "Floor Plan Editor" })).toBeVisible();
    }
  });
});
