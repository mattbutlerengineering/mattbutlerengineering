import { readFileSync } from "fs";
import { join } from "path";
import { test, expect } from "./fixtures.js";
import { ERROR_COPY } from "../src/lib/describe-api-error.js";

// mockApi serves /users/me but has no handler for /users/<id>, so a GET here must not fall
// through to the real network — answer it with the same seeded user the page loaded.
const USER_ME = readFileSync(join(import.meta.dirname, "fixtures", "user-me.json"), "utf-8");

// The manager-side R4 class (B1): a mutation that fails must say what did not happen and offer
// the house sentence — never the api-client's "PATCH … failed: 500 …" request line.
test.describe("Profile — save failure (B1 / R4)", () => {
  test("PATCH 500 → 'Changes not saved.' + the serverError sentence; the raw request line never renders", async ({
    mockedPage,
  }) => {
    // Registered AFTER mockApi so it wins (LIFO); mockApi has no PATCH /users/:id handler, and
    // the id is the user-me fixture's. 500, not 503 — the api-client retries 502/503/504.
    await mockedPage.route("**/api/v1/users/usr_e2e_001", (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: '{"error":"server error"}',
          })
        : route.fulfill({ status: 200, contentType: "application/json", body: USER_ME })
    );
    await mockedPage.goto("profile");

    await mockedPage.getByRole("button", { name: "Edit Profile", exact: true }).click();
    const nameField = mockedPage.getByRole("textbox", { name: "Name", exact: true });
    await nameField.fill("E2E Renamed");
    await mockedPage.getByRole("button", { name: "Save Changes", exact: true }).click();

    // Filtered by title: DashboardLayout's session Banner is also role=alert in CI.
    const alert = mockedPage.getByRole("alert").filter({ hasText: "Changes not saved." });
    await expect(alert).toContainText(ERROR_COPY.serverError.detail);
    await expect(mockedPage.getByText(/failed: 500/)).toHaveCount(0);
    // The form stays open with the edit intact — nothing was changed, so nothing is thrown away.
    await expect(nameField).toHaveValue("E2E Renamed");
    await expect(
      mockedPage.getByRole("button", { name: "Save Changes", exact: true })
    ).toBeEnabled();
  });
});
