import { test, expect } from "./fixtures.js";

/** Playwright `GET`/`HEAD`/`OPTIONS` never change server state; everything else does. */
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** A simulated Friday has far fewer events than this; the cap only stops a runaway loop. */
const MAX_STEPS = 400;

const EMPTY_RESERVATIONS_BODY = JSON.stringify({
  data: [],
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
});

test.describe("Dress Rehearsal: a simulated Friday night, entirely client-side", () => {
  test("runs from the quiet night to the curtain call and never writes to the API", async ({
    mockedPage,
  }) => {
    // Under reduced motion the banner offers "Next event" instead of Play, so the clock moves
    // only when the test says so — no waiting on a real-time animation.
    await mockedPage.emulateMedia({ reducedMotion: "reduce" });
    // A tonight with tables and no reservations is the quiet night, which carries the CTA.
    await mockedPage.route("**/api/v1/reservations?*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: EMPTY_RESERVATIONS_BODY })
    );
    await mockedPage.goto("timeline");

    const quietNight = mockedPage.getByTestId("timeline-empty-night");
    await expect(quietNight).toBeVisible();

    // Spy from here on: everything after the live page has loaded is the rehearsal.
    const writes: string[] = [];
    mockedPage.on("request", (request) => {
      if (!READ_ONLY_METHODS.has(request.method()) && request.url().includes("/api/")) {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });

    await quietNight.getByRole("button", { name: "Run a Friday night", exact: true }).click();
    await expect(mockedPage).toHaveURL(/[?&]rehearsal=true/);

    const banner = mockedPage.getByTestId("rehearsal-banner");
    await expect(banner).toBeVisible();
    await expect(mockedPage.getByTestId("timeline-grid")).toBeVisible();
    await expect(mockedPage.getByTestId("curtain-call")).toHaveCount(0);

    // Advance the simulated clock event by event until the night closes.
    const next = banner.getByRole("button", { name: "Next event", exact: true });
    const curtainCall = mockedPage.getByTestId("curtain-call");
    const blocks = mockedPage.locator('[data-testid^="reservation-block-"]');
    let sawReservations = false;
    for (let step = 0; step < MAX_STEPS && !(await curtainCall.isVisible()); step++) {
      await next.click();
      if (!sawReservations && (await blocks.count()) > 0) sawReservations = true;
    }

    expect(sawReservations, "the simulation should put reservations on the timeline").toBe(true);
    await expect(curtainCall).toBeVisible();
    await expect(
      curtainCall.getByRole("button", { name: "Run it again", exact: true })
    ).toBeVisible();

    expect(writes, "rehearsal must make no POST/PUT/PATCH/DELETE to the API").toEqual([]);
  });
});
