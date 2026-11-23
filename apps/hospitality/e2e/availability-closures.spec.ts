import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import { WCAG_A_AA_TAGS } from "./axe-tags.js";
import { DINNER_ONLY_CONFIG, mockClosures } from "./helpers/close-mock.js";
import { localDay } from "./local-day.js";

/**
 * Closures and pauses (docs/features/availability-hub, breakdown L3.2): `availability/closures`
 * lists what is closed or paused now, what is to come, and refunds still open. These are
 * ux.md's walkthrough 3 exception (skip one Monday, then restore it) and walkthrough 13 (resume
 * online booking), with a Host's read-only view and an axe pass.
 */

const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;

interface Rule {
  readonly id: string;
  readonly seriesId?: string;
  readonly [key: string]: unknown;
}

/** The first Monday after today, as a service date. */
function nextMonday(): string {
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = localDay(offset);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 1) return date;
  }
  throw new Error("no Monday within a week");
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** "Mon, Dec 7": a date as a Restore button names it. */
const shortDay = (date: string): string =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));

interface Put {
  readonly expectedVersion: number;
  readonly changes: {
    readonly upsert?: { readonly dateRules?: Rule[] };
    readonly remove?: { readonly dateRules?: string[] };
  };
}

interface State {
  readonly rules: () => Rule[];
  readonly puts: () => Put[];
  readonly deletes: () => string[];
}

/**
 * Serves the config with `initial` date rules, and applies what the page saves: a config PUT
 * upserts and removes rules, a closure DELETE reopens one (and the edits that point at it).
 * Registered after `mockClosures`, so it answers the config and the reopen first.
 */
async function serveRules(page: Page, initial: Rule[]): Promise<State> {
  await mockClosures(page);
  let rules = [...initial];
  let version = DINNER_ONLY_CONFIG.version;
  const puts: Put[] = [];
  const deletes: string[] = [];
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Put;
      puts.push(body);
      const removed = new Set(body.changes.remove?.dateRules ?? []);
      const upserted = body.changes.upsert?.dateRules ?? [];
      rules = [
        ...rules.filter((r) => !removed.has(r.id) && !upserted.some((u) => u.id === r.id)),
        ...upserted,
      ];
      version += 1;
      return route.fulfill(json({ version, changeId: `chg-${version}` }));
    }
    return route.fulfill(
      json({ config: { ...DINNER_ONLY_CONFIG.config, dateRules: rules }, version, source: "rows" })
    );
  });
  await page.route(`${base}/closures/*`, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    const id = route.request().url().split("/").pop()!.split("?")[0]!;
    deletes.push(id);
    rules = rules.filter((r) => r.id !== id && r.seriesId !== id);
    version += 1;
    return route.fulfill(json({ version, changeId: `chg-${version}` }));
  });
  return { rules: () => rules, puts: () => puts, deletes: () => deletes };
}

async function viewAsHost(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
    })
  );
}

const PAUSE: Rule = {
  id: "rule-pause",
  kind: "closure",
  targetKind: "booking",
  bookingTypes: ["online"],
  origin: "pause",
  startsOn: localDay(-1),
  endsOn: null,
};

const seriesOf = (monday: string): Rule => ({
  id: "rule-mondays",
  kind: "closure",
  targetKind: "venue",
  startsOn: monday,
  endsOn: addDays(monday, 28),
  repeat: { version: 1, weekdays: [1] },
});

test.describe("Closures and pauses", () => {
  test("walkthrough 3's exception: skip one Monday of a repeating closure, then restore it", async ({
    mockedPage,
  }) => {
    const monday = nextMonday();
    const state = await serveRules(mockedPage, [seriesOf(monday)]);
    await mockedPage.goto("availability/closures");
    await expect(
      mockedPage.getByRole("heading", { level: 1, name: "Closures and pauses" })
    ).toBeVisible();

    await mockedPage.getByRole("button", { name: /^Edit dates of the closure on/ }).click();
    const dialog = mockedPage.getByRole("dialog", { name: "Edit dates" });
    await dialog.getByRole("button", { name: "Skip this date" }).click();
    await expect.poll(() => state.puts().length).toBe(1);
    expect(state.puts()[0]!.changes.upsert?.dateRules?.[0]).toMatchObject({
      kind: "skip",
      seriesId: "rule-mondays",
    });

    const skipped = state.rules().find((r) => r.kind === "skip")!;
    await mockedPage
      .getByRole("button", { name: `Restore ${shortDay(String(skipped["startsOn"]))}` })
      .click();
    await expect.poll(() => state.puts().length).toBe(2);
    expect(state.puts()[1]!.changes.remove?.dateRules).toEqual([skipped.id]);
    expect(state.rules().some((r) => r.kind === "skip")).toBe(false);
  });

  test("walkthrough 13: resume online booking from the hub, asked once", async ({ mockedPage }) => {
    const state = await serveRules(mockedPage, [PAUSE]);
    await mockedPage.goto("availability");
    await mockedPage.getByRole("button", { name: "Resume online booking" }).click();
    const dialog = mockedPage.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Resume/ }).click();
    await expect.poll(() => state.deletes()).toEqual(["rule-pause"]);
    await expect(mockedPage.getByRole("button", { name: "Resume online booking" })).toHaveCount(0);

    await mockedPage.goto("availability/closures");
    await expect(mockedPage.getByText("Nothing is closed or paused.")).toBeVisible();
  });

  test("resumes from the Closures page too", async ({ mockedPage }) => {
    const state = await serveRules(mockedPage, [PAUSE]);
    await mockedPage.goto("availability/closures");
    await mockedPage.getByRole("button", { name: "Resume online booking" }).click();
    await mockedPage
      .getByRole("dialog")
      .getByRole("button", { name: /^Resume/ })
      .click();
    await expect.poll(() => state.deletes()).toEqual(["rule-pause"]);
  });

  test("a Host sees the list and no Edit, Reopen or Resume", async ({ mockedPage }) => {
    await viewAsHost(mockedPage);
    await serveRules(mockedPage, [PAUSE, seriesOf(nextMonday())]);
    await mockedPage.goto("availability/closures");
    await expect(mockedPage.getByText("Online booking paused until resumed")).toBeVisible();
    for (const name of [/^Edit/, /^Reopen/, /^Resume/, /^Restore/]) {
      await expect(mockedPage.getByRole("button", { name })).toHaveCount(0);
    }
  });

  test("has no axe violations at desktop, tablet and phone widths", async ({ mockedPage }) => {
    await serveRules(mockedPage, [PAUSE, seriesOf(nextMonday())]);
    for (const width of [1280, 820, 375]) {
      await mockedPage.setViewportSize({ width, height: 900 });
      await mockedPage.goto("availability/closures");
      await expect(mockedPage.getByRole("heading", { level: 2, name: "Now" })).toBeVisible();
      const results = await new AxeBuilder({ page: mockedPage })
        .withTags(WCAG_A_AA_TAGS)
        .include("main")
        .analyze();
      expect(results.violations).toEqual([]);
    }
  });
});
