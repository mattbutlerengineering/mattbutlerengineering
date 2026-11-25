import { test, expect } from "./fixtures.js";

// The GitHub call is mocked at the API boundary (`mockApi` in api-mocks.ts):
// nothing here can file a real issue.
test.describe("In-app feedback", () => {
  test("a signed-in user files feedback and sees the issue number", async ({ mockedPage }) => {
    let submitted: Record<string, unknown> | undefined;
    await mockedPage.route("**/api/gen/feedback", async (route) => {
      submitted = route.request().postDataJSON() as Record<string, unknown>;
      await route.fallback();
    });

    await mockedPage.goto("timeline");
    await mockedPage.getByRole("button", { name: "Send feedback" }).click();

    const dialog = mockedPage.getByRole("dialog");
    await expect(dialog.getByText("We'll include:")).toBeVisible();

    await dialog.getByRole("radio", { name: "Idea" }).click();
    await dialog.getByLabel(/Your message/).fill("Let me pin a table to a server.");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();

    await expect(dialog.getByText("Filed as issue #4242.")).toBeVisible();
    expect(submitted).toMatchObject({
      type: "idea",
      message: "Let me pin a table to a server.",
      context: { app: "hospitality" },
    });

    await dialog.getByRole("button", { name: "Done" }).click();
    await expect(dialog).toBeHidden();
  });

  test("a failed send keeps the draft and offers a retry", async ({ mockedPage }) => {
    await mockedPage.route("**/api/gen/feedback", (route) =>
      route.fulfill({
        status: 502,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          title: "Bad Gateway",
          status: 502,
          detail: "We couldn't send your feedback. Please try again.",
        }),
      })
    );

    await mockedPage.goto("timeline");
    await mockedPage.getByRole("button", { name: "Send feedback" }).click();
    const dialog = mockedPage.getByRole("dialog");
    await dialog.getByLabel(/Your message/).fill("The seat button does nothing.");
    await dialog.getByRole("button", { name: "Send", exact: true }).click();

    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByLabel(/Your message/)).toHaveValue("The seat button does nothing.");
    await expect(dialog.getByRole("button", { name: "Try again" })).toBeEnabled();
  });

  test("the control is hidden when the server has no feedback token", async ({ mockedPage }) => {
    await mockedPage.route("**/api/gen/feedback/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { available: false }, error: null }),
      })
    );

    await mockedPage.goto("timeline");
    await expect(mockedPage.getByTestId("dashboard-layout")).toBeVisible();
    await expect(mockedPage.getByRole("button", { name: "Send feedback" })).toHaveCount(0);
  });
});
