import { test, expect } from "./fixtures.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

test.describe("CF-10: Settings page and preferences persistence", () => {
  test("page loads with heading and appearance card", async ({ mockedPage }) => {
    await mockedPage.goto("settings");

    await expect(mockedPage.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(mockedPage.getByText("Appearance")).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/settings-loaded.png", fullPage: true });
  });

  test("theme selector is visible with options", async ({ mockedPage }) => {
    await mockedPage.goto("settings");

    await expect(mockedPage.getByText(/system|light|dark/i).first()).toBeVisible();
  });

  test("settings page persists across navigation", async ({ mockedPage }) => {
    await mockedPage.goto("settings");

    await expect(mockedPage.getByRole("heading", { name: "Settings" })).toBeVisible();

    await mockedPage.goto("");
    await mockedPage.goto("settings");

    await expect(mockedPage.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(mockedPage.getByText("Appearance")).toBeVisible();
  });

  test("notifications card is visible", async ({ mockedPage }) => {
    await mockedPage.goto("settings");

    await expect(mockedPage.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await mockedPage.screenshot({
      path: "e2e/screenshots/settings-notifications.png",
      fullPage: true,
    });
  });
});

test.describe("Staff locale switcher", () => {
  test("sidebar switch updates the UI in place and persists across reload", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("settings");
    await expect(mockedPage.getByRole("heading", { name: "Settings" })).toBeVisible();

    await mockedPage
      .getByRole("navigation")
      .getByRole("button", { name: /Language/ })
      .click();
    await mockedPage.getByRole("menuitem", { name: /Español/ }).click();
    await expect(mockedPage.getByText("Idioma y región")).toBeVisible();

    await mockedPage.reload();
    await expect(mockedPage.getByText("Idioma y región")).toBeVisible();
  });
});

test.describe("Connect an AI assistant (#9665)", () => {
  test("mint shows the token once, copy works, revoke removes it", async ({
    mockedPage,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockedPage.goto("settings");

    await expect(
      mockedPage.getByRole("heading", { name: "Connect an AI assistant" })
    ).toBeVisible();
    await expect(mockedPage.getByRole("listitem", { name: "Claude Desktop" })).toBeVisible();

    await mockedPage.getByLabel("Token name").fill("Cursor");
    await mockedPage.getByRole("button", { name: "Create token" }).click();

    await expect(mockedPage.getByLabel("Your token")).toHaveValue("mbe_pat_e2e9_fake");
    await expect(mockedPage.getByText(/won.t see this again/)).toBeVisible();
    await mockedPage.getByRole("button", { name: "Copy token" }).click();
    await expect(mockedPage.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();

    await mockedPage.getByRole("button", { name: "Done" }).click();
    await expect(mockedPage.getByLabel("Your token")).toHaveCount(0);
    await expect(mockedPage.getByRole("listitem", { name: "Cursor" })).toBeVisible();

    await mockedPage.getByRole("button", { name: "Revoke Claude Desktop" }).click();
    await mockedPage
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revoke", exact: true })
      .click();
    await expect(mockedPage.getByRole("listitem", { name: "Claude Desktop" })).toHaveCount(0);
  });

  test("a token minted with 'make changes' ticked is listed as can make changes", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("settings");
    const box = mockedPage.getByRole("checkbox", { name: /^Allow this token to make changes/ });
    await expect(box).not.toBeChecked();

    await mockedPage.getByLabel("Token name").fill("Writer");
    await box.check({ force: true });
    await mockedPage.getByRole("button", { name: "Create token" }).click();
    await mockedPage.getByRole("button", { name: "Done" }).click();

    const row = mockedPage.getByRole("listitem", { name: "Writer" });
    await expect(row.getByText("Can make changes")).toBeVisible();
    await expect(
      mockedPage.getByRole("listitem", { name: "Claude Desktop" }).getByText("Read only")
    ).toBeVisible();
  });
});
