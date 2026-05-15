import { test, expect } from "./fixtures.js";
import { AxeBuilder } from "@axe-core/playwright";

test.describe("Playground", () => {
  test("loads with prompt textarea", async ({ authPage }) => {
    await authPage.goto("/");
    await expect(authPage.getByPlaceholder("Describe the UI you want to build...")).toBeVisible();
  });

  test("Generate button is visible", async ({ authPage }) => {
    await authPage.goto("/");
    await expect(authPage.getByRole("button", { name: "Generate" })).toBeVisible();
  });

  test("can type a prompt", async ({ authPage }) => {
    await authPage.goto("/");
    const textarea = authPage.getByPlaceholder("Describe the UI you want to build...");
    await textarea.fill("a simple button");
    await expect(textarea).toHaveValue("a simple button");
    await expect(authPage.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  test("has no critical a11y violations", async ({ authPage }) => {
    await authPage.goto("/");
    // Wait for the playground to fully render
    await expect(authPage.getByPlaceholder("Describe the UI you want to build...")).toBeVisible();
    const results = await new AxeBuilder({ page: authPage }).withTags(["wcag2aa"]).analyze();
    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );
    expect(violations).toHaveLength(0);
  });
});
