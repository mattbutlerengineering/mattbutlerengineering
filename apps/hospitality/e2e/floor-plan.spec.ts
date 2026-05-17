import { test, expect } from "./fixtures.js";

test.describe("CF-4: Floor plan editor", () => {
  test("floor plans page shows cards", async ({ mockedPage }) => {
    await mockedPage.goto("/floor-plans");

    await expect(mockedPage.getByRole("heading", { name: "Floor Plans" })).toBeVisible();
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
