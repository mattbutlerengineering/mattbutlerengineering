import { test, expect } from "./fixtures.js";

test.describe("Regulars Club (#9626)", () => {
  test("lists members, invites by email and revokes", async ({ mockedPage }) => {
    await mockedPage.goto("guests");

    const panel = mockedPage.getByTestId("regulars-club");
    await expect(panel.getByRole("heading", { name: "Regulars Club" })).toBeVisible();
    await expect(panel.getByText("Marguerite Dupont")).toBeVisible();
    await expect(panel.getByText("Active")).toBeVisible();

    await panel.getByLabel("Name").fill("Cara Nguyen");
    await panel.getByLabel("Email").fill("cara@example.com");
    await panel.getByRole("button", { name: "Send invitation" }).click();

    await expect(panel.getByRole("status")).toContainText("Invitation sent to cara@example.com");
    await expect(panel.getByText("Cara Nguyen")).toBeVisible();

    await panel.getByRole("button", { name: "Revoke Cara Nguyen" }).click();
    await expect(panel.getByText("Revoked")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Revoke Cara Nguyen" })).toHaveCount(0);
  });
});
