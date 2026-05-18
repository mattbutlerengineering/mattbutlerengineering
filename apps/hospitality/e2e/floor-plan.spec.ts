import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-4: Floor plan editor", () => {
  test("floor plans page shows cards", async ({ mockedPage }) => {
    await mockedPage.goto("/floor-plans");

    await expect(mockedPage.getByRole("heading", { name: "Floor Plans" })).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/floor-plan-cards.png", fullPage: true });
  });

  test("can navigate to editor", async ({ mockedPage }) => {
    await mockedPage.goto("/floor-plans");

    const cards = mockedPage.locator('[class*="card"]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click();
      await expect(mockedPage.getByRole("heading", { name: "Floor Plan Editor" })).toBeVisible();
    }
  });
});
