import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";

/** `GET`/`HEAD`/`OPTIONS` never change server state; everything else does. */
const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Third parties the app talks to on its own: their writes are not the app's API writes. */
const THIRD_PARTY_HOSTS = [/(^|\.)auth0\.com$/, /(^|\.)sentry\.io$/];
/** A simulated Friday has far fewer events than this; the cap only stops a runaway loop. */
const MAX_STEPS = 400;
const REHEARSAL_TIMEOUT_MS = 60_000;

const EMPTY_RESERVATIONS_BODY = JSON.stringify({
  data: [],
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
});

function isThirdParty(url: string): boolean {
  const { hostname } = new URL(url);
  return THIRD_PARTY_HOSTS.some((pattern) => pattern.test(hostname));
}

/**
 * Records every state-changing request the page issues to anything but a known third party, by
 * method alone: `/api/v1/...`, `/public/v1/...` and any other path count alike.
 */
function watchWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!READ_ONLY_METHODS.has(request.method()) && !isThirdParty(request.url())) {
      writes.push(`${request.method()} ${request.url()}`);
    }
  });
  return writes;
}

/** Clicks "Next event" until `done` holds, failing loudly if the night never gets there. */
async function stepUntil(
  next: Locator,
  done: () => Promise<boolean>,
  onStep: () => Promise<void> = async () => {}
): Promise<void> {
  for (let step = 0; step < MAX_STEPS; step++) {
    if (await done()) return;
    await next.click();
    await onStep();
  }
  if (!(await done())) {
    throw new Error(`Rehearsal did not finish within ${MAX_STEPS} "Next event" clicks`);
  }
}

/**
 * A block can be "visible" yet sit left of the grid (api-mocks.ts: a negatively positioned block
 * still has a bounding box). Bring it into view, then require it to start at or past the grid's
 * left edge — a block that cannot be scrolled there is off the grid.
 */
async function expectBlockOnGrid(block: Locator, grid: Locator): Promise<void> {
  await block.scrollIntoViewIfNeeded();
  await expect(block).toBeVisible();
  const blockBox = await block.boundingBox();
  const gridBox = await grid.boundingBox();
  expect(blockBox, "block has a bounding box").not.toBeNull();
  expect(gridBox, "grid has a bounding box").not.toBeNull();
  expect(blockBox!.x).toBeGreaterThanOrEqual(gridBox!.x);
}

test.describe("Dress Rehearsal: a simulated Friday night, entirely client-side", () => {
  test.setTimeout(REHEARSAL_TIMEOUT_MS);

  test.beforeEach(async ({ mockedPage }) => {
    // Under reduced motion the banner offers "Next event" instead of Play, so the clock moves
    // only when the test says so — no waiting on a real-time animation.
    await mockedPage.emulateMedia({ reducedMotion: "reduce" });
    // `RehearsalTimeline` seeds its simulation from Math.random; pin it for a repeatable night.
    await mockedPage.addInitScript(() => {
      Math.random = () => 0.5;
    });
  });

  test("the write spy catches a POST (positive control)", async ({ mockedPage }) => {
    const writes = watchWrites(mockedPage);
    await mockedPage.evaluate(async () => {
      await fetch("/api/v1/x", { method: "POST" }).catch(() => undefined);
      await fetch("/public/v1/x", { method: "PUT" }).catch(() => undefined);
    });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatch(/^POST .*\/api\/v1\/x$/);
    expect(writes[1]).toMatch(/^PUT .*\/public\/v1\/x$/);
  });

  test("timeline runs from the quiet night to the curtain call and never writes", async ({
    mockedPage,
  }) => {
    // A tonight with tables and no reservations is the quiet night, which carries the CTA.
    await mockedPage.route("**/api/v1/reservations?*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: EMPTY_RESERVATIONS_BODY })
    );
    await mockedPage.goto("timeline");

    const quietNight = mockedPage.getByTestId("timeline-empty-night");
    await expect(quietNight).toBeVisible();

    // Spy from here on: everything after the live page has loaded is the rehearsal.
    const writes = watchWrites(mockedPage);

    await quietNight.getByRole("button", { name: "Run a Friday night", exact: true }).click();
    await expect(mockedPage).toHaveURL(/[?&]rehearsal=true/);

    const banner = mockedPage.getByTestId("rehearsal-banner");
    const grid = mockedPage.getByTestId("timeline-grid");
    await expect(banner).toBeVisible();
    await expect(grid).toBeVisible();
    await expect(mockedPage.getByTestId("curtain-call")).toHaveCount(0);

    const curtainCall = mockedPage.getByTestId("curtain-call");
    const blocks = mockedPage.locator('[data-testid^="reservation-block-"]');
    let blockChecked = false;
    await stepUntil(
      banner.getByRole("button", { name: "Next event", exact: true }),
      () => curtainCall.isVisible(),
      async () => {
        if (!blockChecked && (await blocks.count()) > 0) {
          await expectBlockOnGrid(blocks.first(), grid);
          blockChecked = true;
        }
      }
    );

    expect(blockChecked, "the simulation should put a reservation on the timeline").toBe(true);
    await expect(
      curtainCall.getByRole("button", { name: "Run it again", exact: true })
    ).toBeVisible();

    expect(writes, "rehearsal must make no state-changing request").toEqual([]);
  });

  test("floor plan shows a table seated as the night advances and never writes", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("floor-plans/fp_e2e_001?rehearsal=true");

    const banner = mockedPage.getByTestId("rehearsal-banner");
    await expect(banner).toBeVisible();
    // Spy from here on: the plan is read once by the live hooks; the rehearsal itself must not write.
    const writes = watchWrites(mockedPage);

    // TableSelectionOverlay names each table button "Table <n>, <status>".
    const seatedTable = mockedPage.getByRole("button", { name: /^Table .+, Seated$/ });
    await stepUntil(
      banner.getByRole("button", { name: "Next event", exact: true }),
      async () => (await seatedTable.count()) > 0
    );

    await expect(seatedTable.first()).toBeVisible();
    expect(writes, "rehearsal must make no state-changing request").toEqual([]);
  });
});
