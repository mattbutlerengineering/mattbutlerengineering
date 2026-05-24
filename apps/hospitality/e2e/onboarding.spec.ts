import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("Venue onboarding wizard", () => {
  test("page loads with heading and step 1 (Basic Info)", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await expect(mockedPage.getByRole("heading", { name: "New Venue" })).toBeVisible();
    await expect(mockedPage.getByLabel("Venue Name")).toBeVisible();
    await expect(mockedPage.getByLabel("Slug")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/onboarding-step1.png", fullPage: true });
  });

  test("step 1 requires venue name before advancing", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByLabel("Venue Name")).toBeVisible();
  });

  test("completes step 1 and advances to step 2", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");

    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();
  });

  test("step 2 shows timezone and currency selectors", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();
    await expect(mockedPage.getByLabel("Currency")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/onboarding-step2.png", fullPage: true });
  });

  test("Back button returns to previous step", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await mockedPage.getByRole("button", { name: "Next" }).click();
    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();

    await mockedPage.getByRole("button", { name: "Back" }).click();

    await expect(mockedPage.getByLabel("Venue Name")).toBeVisible();
  });

  test("Back button is disabled on step 1", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await expect(mockedPage.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  test("advances through all 5 steps to confirmation", async ({ mockedPage }) => {
    await mockedPage.goto("onboarding");

    await mockedPage.getByLabel("Venue Name").fill("E2E Test Venue");
    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByLabel("Timezone")).toBeVisible();
    await mockedPage.getByRole("button", { name: "Next" }).click();

    await mockedPage.getByRole("button", { name: "Next" }).click();

    await mockedPage.getByRole("button", { name: "Next" }).click();

    await expect(mockedPage.getByRole("button", { name: /create venue/i })).toBeVisible();
    await expect(mockedPage.getByText("Basic Information")).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/onboarding-complete.png",
      fullPage: true,
    });
  });
});
