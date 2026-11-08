import type { Page } from "@playwright/test";
import { loadFixture } from "./api-mocks.js";
import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

/**
 * Selects table 1 from the sidebar's table list. The canvas's table buttons are an a11y overlay
 * under a `<canvas>` that intercepts pointer events, so they are not clickable.
 */
async function selectTable1(page: Page): Promise<void> {
  await page
    .locator('[class*="tableListStack"]')
    .getByRole("button", { name: "1", exact: true })
    .click();
}

test.describe("CF-4: Floor plan editor", () => {
  test("floor plans page shows cards", async ({ mockedPage }) => {
    await mockedPage.goto("floor-plans");

    await expect(
      mockedPage.getByRole("heading", { name: "Floor Plan", exact: true })
    ).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/floor-plan-cards.png", fullPage: true });
  });

  test("can navigate to editor", async ({ mockedPage }) => {
    await mockedPage.goto("floor-plans");

    const cards = mockedPage.locator('[class*="card"]');
    const count = await cards.count();

    if (count > 0) {
      await cards.first().click();
      await expect(mockedPage.getByRole("heading", { name: "Floor Plan Editor" })).toBeVisible();
    }
  });

  // #8478: a Manager puts a table into a section (and back out) from the table form.
  test("manager assigns a table to a section and it persists", async ({ mockedPage }) => {
    const sections = [
      { id: "sec_e2e_main", name: "Main Dining" },
      { id: "sec_e2e_bar", name: "Bar" },
    ].map((section, displayOrder) => ({
      ...section,
      venueId: "ven_e2e_001",
      floorPlanId: "fp_e2e_001",
      color: "#8b7355",
      displayOrder,
      floorMaterial: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    let sectionId: string | null = null;
    const patches: Array<Record<string, unknown>> = [];

    await mockedPage.route(/\/api\/v1\/floor-plan-sections(\?|$)/, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: sections }),
          })
        : route.fallback()
    );
    // Built from the fixture directly (not `route.fetch()`, which would bypass the shared
    // mocks), with the assignment the PATCH below recorded.
    await mockedPage.route(/\/api\/v1\/floor-plans\/fp_e2e_001$/, (route) => {
      const fixture = JSON.parse(loadFixture("floor-plans-list")) as {
        data: Array<{ tables: Array<{ id: string }> }>;
      };
      const plan = fixture.data[0];
      if (!plan) return route.fallback();
      const tables = plan.tables.map((table) =>
        table.id === "tbl_e2e_001" ? { ...table, sectionId } : table
      );
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...plan, tables } }),
      });
    });
    await mockedPage.route(/\/api\/v1\/tables\/tbl_e2e_001$/, (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      if ("sectionId" in body) sectionId = body.sectionId as string | null;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { id: "tbl_e2e_001", sectionId } }),
      });
    });

    await mockedPage.goto("floor-plans/fp_e2e_001");
    await selectTable1(mockedPage);

    await mockedPage.getByRole("combobox", { name: "Section" }).click();
    await mockedPage.getByRole("option", { name: "Bar" }).click();
    await mockedPage.getByRole("button", { name: "Save Table" }).click();

    await expect.poll(() => patches).toEqual([{ sectionId: "sec_e2e_bar" }]);

    // Reload: the assignment is read back from the floor plan, not held in form state.
    await mockedPage.reload();
    await selectTable1(mockedPage);
    await expect(mockedPage.getByRole("combobox", { name: "Section" })).toHaveText(/Bar/);

    // And back out again.
    await mockedPage.getByRole("combobox", { name: "Section" }).click();
    await mockedPage.getByRole("option", { name: "No section" }).click();
    await mockedPage.getByRole("button", { name: "Save Table" }).click();
    await expect.poll(() => patches.at(-1)).toEqual({ sectionId: null });
  });
});
