import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

const VENUE_SLUG = "e2e-test-bistro";
const GUEST_URL = `menu/${VENUE_SLUG}/dinner`;

/** Owner creates the Draft "Dinner" menu with a Starters section holding Soup and Bread. */
async function buildDinnerMenu(page: Page): Promise<void> {
  await page.goto("menus");
  await page.getByRole("button", { name: "New menu" }).first().click();

  const newMenu = page.getByRole("form", { name: "New menu" });
  await newMenu.getByLabel("Name", { exact: true }).fill("Dinner");
  await newMenu.getByRole("button", { name: "Create menu" }).click();

  await page.getByRole("link", { name: "Edit Dinner" }).click();

  await page.getByLabel("Section name").fill("Starters");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByRole("heading", { name: "Starters" })).toBeVisible();

  const addDish = page.getByRole("form", { name: "Add a dish to Starters" });
  const dishes: Array<[name: string, price: string]> = [
    ["Soup", "8.50"],
    ["Bread", "4.00"],
  ];
  for (const [name, price] of dishes) {
    await addDish.getByLabel("Dish name").fill(name);
    await addDish.getByLabel("Price (USD)").fill(price);
    await addDish.getByRole("button", { name: "Add dish" }).click();
    await expect(page.getByRole("switch", { name: `${name} sold out` })).toBeVisible();
  }
}

async function setMenuActive(page: Page): Promise<void> {
  const details = page.getByRole("form", { name: "Menu details" });
  await details.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().includes("/menus/")),
    details.getByRole("button", { name: "Save changes" }).click(),
  ]);
}

test.describe("Menus — operator to guest loop (#7073)", () => {
  test("owner publishes a menu and the guest sees both dishes with prices", async ({
    mockedPage,
  }) => {
    await buildDinnerMenu(mockedPage);
    await setMenuActive(mockedPage);

    await mockedPage.goto(GUEST_URL);

    await expect(mockedPage.getByRole("heading", { name: "Dinner", level: 1 })).toBeVisible();
    await expect(mockedPage.getByRole("listitem").filter({ hasText: "Soup" })).toContainText(
      "$8.50"
    );
    await expect(mockedPage.getByRole("listitem").filter({ hasText: "Bread" })).toContainText(
      "$4.00"
    );
  });

  test("a dish the owner marks sold out shows the badge to the guest after reload", async ({
    mockedPage,
  }) => {
    await buildDinnerMenu(mockedPage);
    await setMenuActive(mockedPage);

    await mockedPage.goto(GUEST_URL);
    await expect(mockedPage.getByText("Soup")).toBeVisible();
    await expect(mockedPage.getByText("Sold out")).toHaveCount(0);

    await mockedPage.goto("menus");
    await mockedPage.getByRole("link", { name: "Edit Dinner" }).click();
    // The toggle is optimistic: wait for the PATCH to land before leaving the page.
    await Promise.all([
      mockedPage.waitForResponse(
        (r) => r.request().method() === "PATCH" && r.url().includes("/items/")
      ),
      mockedPage.getByRole("switch", { name: "Soup sold out" }).check(),
    ]);

    await mockedPage.goto(GUEST_URL);
    await expect(mockedPage.getByRole("listitem").filter({ hasText: "Soup" })).toContainText(
      "Sold out"
    );
    await expect(mockedPage.getByRole("listitem").filter({ hasText: "Bread" })).not.toContainText(
      "Sold out"
    );
  });

  test("a Draft menu is not reachable by guests", async ({ mockedPage }) => {
    await buildDinnerMenu(mockedPage);

    await mockedPage.goto(GUEST_URL);

    await expect(mockedPage.getByRole("heading", { name: "Menu not found" })).toBeVisible();
    await expect(mockedPage.getByText("Soup")).toHaveCount(0);
  });
});
