import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-4: Floor plan editor", () => {
  test("floor plans page shows cards", async ({ mockedPage }) => {
    await mockedPage.goto("floor-plans");

    await expect(mockedPage.getByRole("heading", { name: "Floor Plans" })).toBeVisible();
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
    await mockedPage.route(/\/api\/v1\/floor-plans\/fp_e2e_001$/, async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { data?: { tables?: Array<{ id: string }> } };
      const plan = body.data ?? (body as { tables?: Array<{ id: string }> });
      const tables = (plan.tables ?? []).map((table) =>
        table.id === "tbl_e2e_001" ? { ...table, sectionId } : table
      );
      const next = body.data ? { ...body, data: { ...body.data, tables } } : { ...body, tables };
      await route.fulfill({ response, json: next });
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
    await mockedPage
      .getByRole("button", { name: /Table 1/ })
      .first()
      .click();

    await mockedPage.getByRole("combobox", { name: "Section" }).click();
    await mockedPage.getByRole("option", { name: "Bar" }).click();
    await mockedPage.getByRole("button", { name: "Save Table" }).click();

    await expect.poll(() => patches).toEqual([{ sectionId: "sec_e2e_bar" }]);

    // Reload: the assignment is read back from the floor plan, not held in form state.
    await mockedPage.reload();
    await mockedPage
      .getByRole("button", { name: /Table 1/ })
      .first()
      .click();
    await expect(mockedPage.getByRole("combobox", { name: "Section" })).toHaveText(/Bar/);

    // And back out again.
    await mockedPage.getByRole("combobox", { name: "Section" }).click();
    await mockedPage.getByRole("option", { name: "No section" }).click();
    await mockedPage.getByRole("button", { name: "Save Table" }).click();
    await expect.poll(() => patches.at(-1)).toEqual({ sectionId: null });
  });
});
