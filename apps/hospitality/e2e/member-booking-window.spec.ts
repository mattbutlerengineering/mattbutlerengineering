import { test, expect } from "./fixtures.js";

const VENUE_NAME = "E2E Test Bistro";
const VENUE_SLUG = "e2e-test-bistro";

const json = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test.describe("Booking widget — Regulars Club member link (#9627)", () => {
  test("a member link shows the early window and sends the token on availability", async ({
    mockedPage,
  }) => {
    const availabilityTokens: Array<string | undefined> = [];
    await mockedPage.route("**/public/v1/venues/*/member", (route) =>
      route.fulfill(json({ data: { member: true, leadDays: 7 } }))
    );
    await mockedPage.route("**/public/v1/venues/*/availability*", (route) => {
      availabilityTokens.push(route.request().headers()["x-member-token"]);
      return route.fulfill(json({ data: [] }));
    });

    await mockedPage.goto(`book/${VENUE_SLUG}?member=signed-token`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();
    await expect(mockedPage.getByText("Members book 7 days early")).toBeVisible();

    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();
    await expect.poll(() => availabilityTokens.length).toBeGreaterThan(0);
    expect(availabilityTokens.every((token) => token === "signed-token")).toBe(true);
  });

  test("a public guest sees nothing new and sends no token", async ({ mockedPage }) => {
    const memberCalls: string[] = [];
    await mockedPage.route("**/public/v1/venues/*/member", (route) => {
      memberCalls.push(route.request().url());
      return route.fulfill(json({ data: { member: false, leadDays: 0 } }));
    });

    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();

    await expect(mockedPage.getByText(/Members book/)).toHaveCount(0);
    await expect(mockedPage.getByText(/member link/i)).toHaveCount(0);
    expect(memberCalls).toEqual([]);
  });

  test("a revoked or invalid link falls back to the public window with a plain notice", async ({
    mockedPage,
  }) => {
    await mockedPage.route("**/public/v1/venues/*/member", (route) =>
      route.fulfill(json({ data: { member: false, leadDays: 0 } }))
    );

    await mockedPage.goto(`book/${VENUE_SLUG}?member=revoked-token`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();

    await expect(
      mockedPage.getByText("This member link isn't active. Showing the dates open to everyone.")
    ).toBeVisible();
    await expect(mockedPage.getByText(/Members book/)).toHaveCount(0);
  });
});
