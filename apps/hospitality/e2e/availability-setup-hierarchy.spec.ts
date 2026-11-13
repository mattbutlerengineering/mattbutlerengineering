import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { buildVenueTeamFixture, loadFixture } from "./api-mocks.js";
import { mockClosures } from "./helpers/close-mock.js";
import type { AvailabilityConfigResponse } from "./helpers/close-mock.js";
import { RESOURCE_TYPES, editorsVisibleOn } from "./helpers/editor-surfaces.js";
import type { ResourceType } from "./helpers/editor-surfaces.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { countFirstPaintControls, weekPanel } from "./helpers/first-paint.js";
import { countInteractions } from "./helpers/interaction-counter.js";
import {
  TWO_SERVICE_VARIED_WEEK_BASELINE_7C051456F,
  setTwoServiceVariedWeek,
  setUniformBistroWeek,
} from "./helpers/quick-setup-scenarios.js";
import {
  captureConfigPuts,
  firstPaint,
  layerOption,
  mockNoopPreview,
  nextMonthDay,
  pickerDay,
  pinToday,
} from "./helpers/scenario-fixtures.js";
import { localDay } from "./local-day.js";

/**
 * Setup hierarchy end to end (breakdown "Setup hierarchy end-to-end scenarios", checks a-e,
 * adapted to the layered `/availability` of the 2026-11-08 amendment), PRD 2, 3, 7, 9, 10, 15, 21
 * and 23.
 *
 * Counts are agent stand-in evidence on a local run with a synthetic OIDC session; the hand-timing
 * bar (<= 5 minutes) stays an Owner-only check. The "before" numbers (check (a)'s editor table and
 * check (b)'s interaction count) were measured on a throwaway worktree of origin/main @ 7c051456f
 * with the same signatures and the same script, and are encoded below as the expected pre-change
 * values; the "after" numbers are asserted live.
 */

const PHONE = { width: 375, height: 812 } as const;

const PRIMARY_WEEK = "Schedules layer: week panel";
const STARTING_LATER = "Starting later… drawer";
const ADD_SCHEDULE = "Add a schedule… drawer";
const DAY_EDITOR = "Day drawer: day editor (Copy day)";
const QUICK_SETUP_CARD = "Quick-setup card (empty venue)";
const PRIMARY_CLOSE = "Close dialog";
const PRIMARY_BOOKING = "Booking rules drawer";
const PRIMARY_NEW_FLOOR_PLAN = "Floor Plan: New Floor Plan dialog";
const PRIMARY_FLOOR_PLAN_EDITOR = "Floor Plan: editor";

/** The one editor each resource type of PRD criterion 1 is edited in. */
const PRIMARY_EDITOR: Readonly<Record<ResourceType, string>> = {
  weeklyHours: PRIMARY_WEEK,
  services: PRIMARY_WEEK,
  specialDates: PRIMARY_CLOSE,
  booking: PRIMARY_BOOKING,
  floorPlan: PRIMARY_NEW_FLOOR_PLAN,
  sections: PRIMARY_NEW_FLOOR_PLAN,
  tables: PRIMARY_FLOOR_PLAN_EDITOR,
};

/**
 * Frames of the primary editor that still host its form, which PRD 2 allows ("Copy day and quick
 * setup may stay as actions inside the primary editor's flow"; ux.md counts the drawers opened
 * from the week panel as frames of the one form). Each is opened from the primary editor's own
 * surface, and the table asserts every one still hosts the form, so a stale entry fails.
 */
const IN_FLOW: Readonly<Record<ResourceType, readonly string[]>> = {
  weeklyHours: [STARTING_LATER, ADD_SCHEDULE, DAY_EDITOR, QUICK_SETUP_CARD],
  services: [STARTING_LATER, ADD_SCHEDULE, QUICK_SETUP_CARD],
  specialDates: [],
  booking: [],
  floorPlan: [],
  sections: [],
  tables: [],
};

/**
 * "Before": editors per resource type on origin/main @ 7c051456f, as the surfaces that host the
 * type's writable form with no further navigation (`helpers/editor-surfaces.ts` signatures, a
 * throwaway worktree run, one-schedule fixture venue plus the empty venue). The onboarding wizard
 * steps are not driven by the e2e (see the PR body); they are counted from the code, where the
 * hours, Settings and Floor plan steps each render their form, and are marked (code).
 */
const BEFORE_7C051456F: Readonly<
  Record<ResourceType, { readonly count: number; readonly surfaces: readonly string[] }>
> = {
  weeklyHours: {
    count: 5,
    surfaces: [
      "Change regular week… drawer",
      "Create another schedule… editor",
      "day drawer editor (Copy day)",
      "quick-setup card",
      "onboarding hours step (code)",
    ],
  },
  services: {
    count: 4,
    surfaces: [
      "Change regular week… drawer",
      "Create another schedule… editor",
      "quick-setup card",
      "onboarding hours step (code)",
    ],
  },
  specialDates: { count: 1, surfaces: ["Close dialog (toolbar Close… and the day drawer)"] },
  booking: {
    count: 2,
    surfaces: ["Booking rules drawer", "onboarding Settings step (code)"],
  },
  floorPlan: {
    count: 2,
    surfaces: ["New Floor Plan dialog", "onboarding Floor plan step (code)"],
  },
  sections: {
    count: 2,
    surfaces: ["New Floor Plan dialog (room template)", "onboarding Floor plan step (code)"],
  },
  tables: {
    count: 2,
    surfaces: ["floor plan editor (+ Add Table)", "onboarding Floor plan step (code)"],
  },
};

/** Registered after mockApi, so it wins: the viewer is a Host at the venue. */
async function viewAsHost(page: Page): Promise<void> {
  await page.route(/\/api\/v1\/venues\/[^/?]+\/team$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { ...buildVenueTeamFixture(), viewerRole: "host" } }),
    })
  );
}

/**
 * The floor plan's sections as the sections read serves them. `add()` puts the Bar section on the
 * floor plan, as the demo's "add one section" does (the floor plan editor's section authoring is
 * outside this scenario); `present` starts it there for the specs that only need a section to name.
 */
async function mockBarSection(
  page: Page,
  options: { readonly present?: boolean } = {}
): Promise<{ readonly add: () => void }> {
  let present = options.present ?? true;
  await page.route(/\/api\/v1\/floor-plan-sections(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const at = "2026-01-01T00:00:00.000Z";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: present
          ? [
              {
                id: "sec-bar",
                venueId: "ven_e2e_001",
                floorPlanId: "fp_e2e_001",
                name: "Bar",
                color: "#8b7355",
                displayOrder: 0,
                createdAt: at,
                updatedAt: at,
              },
            ]
          : [],
      }),
    });
  });
  return {
    add: () => {
      present = true;
    },
  };
}

/** The fixture venue's floor plan, over `mockEmptyVenue`'s "no floor plan yet" (the later route wins). */
async function mockMainFloorPlan(page: Page): Promise<void> {
  await page.route("**/api/v1/floor-plans?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: loadFixture("floor-plans-list"),
    })
  );
}

/** The fixture venue with no booking rules set, so every node of the empty venue is unset. */
async function withoutBookingRules(page: Page): Promise<void> {
  const venues = JSON.parse(loadFixture("venues-list")) as {
    data: Array<Record<string, unknown>>;
    pagination: Record<string, unknown>;
  };
  await page.route("**/api/v1/venues?*", (route) => {
    const data = venues.data.map((venue) => ({ ...venue, operatingHours: null, settings: null }));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, pagination: venues.pagination }),
    });
  });
}

/** Opens the hub and returns the config it was served, so a later mock can carry on from it. */
async function openHubWithConfig(page: Page): Promise<{
  readonly served: AvailabilityConfigResponse;
  readonly schedules: Locator;
}> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/availability\/config$/.test(r.url()) && r.request().method() === "GET"
    ),
    page.goto("setup"),
  ]);
  const { data } = (await response.json()) as { data: AvailabilityConfigResponse };
  return { served: data, schedules: page.getByRole("listitem", { name: /Schedules/ }) };
}

test.describe("Setup hierarchy: the layered Availability page", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("(a) each resource type has one primary editor, reached from the hub", async ({
    mockedPage: page,
  }) => {
    await mockNoopPreview(page);
    await page.goto("setup");
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();

    // Regular week: the week form on the first layer. No drawer, no date picker first.
    await page.getByRole("button", { name: "Change regular week…" }).click();
    await expect(page).toHaveURL(/\/availability\/calendar\?tab=schedules/);
    await expect(weekPanel(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Schedules: the schedule editor, seeded from the regular week, on the Schedules layer.
    await page.goto("setup");
    await page.getByRole("button", { name: "Add a schedule…" }).first().click();
    await expect(page).toHaveURL(/\/availability\/calendar\?tab=schedules/);
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: /Schedule name/ })
    ).toBeVisible();

    // Special dates: the Special dates layer.
    await page.goto("setup");
    await page.getByRole("button", { name: "Open Special dates" }).click();
    await expect(page).toHaveURL(/\/availability\/calendar\?tab=special/);
    await expect(layerOption(page, "Special dates")).toBeChecked();

    // Booking: its drawer, at the address the Availability hub opens it at (availability-hub C2.5).
    await page.goto("setup");
    await page.getByRole("button", { name: "Booking rules…" }).click();
    await expect(page).toHaveURL(/\/availability\/booking-rules\?from=setup$/);
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toHaveCount(0);

    // Floor plan, sections and tables: the floor plan editor.
    await page.goto("setup");
    await page.getByRole("button", { name: "Open floor plan Main Floor" }).click();
    await expect(page).toHaveURL(/\/floor-plans\/fp_e2e_001$/);
  });

  test("(a) editors per resource type: before on 7c051456f, after is one primary editor each", async ({
    mockedPage: page,
  }) => {
    test.slow();
    await mockNoopPreview(page);
    const hosts = new Map<ResourceType, readonly string[]>();
    const visit = async (surface: string) => {
      for (const type of await editorsVisibleOn(page)) {
        hosts.set(type, [...(hosts.get(type) ?? []), surface]);
      }
    };

    await page.goto("setup");
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    await visit("Venue Setup hub");
    await firstPaint(page);
    // The services are closed lines; the one Manager opens is the week panel's own editor.
    await weekPanel(page)
      .getByRole("button", { name: /^Lunch ?, / })
      .click();
    await visit(PRIMARY_WEEK);
    await page.getByRole("button", { name: "Starting later…" }).click();
    await expect(page.getByRole("dialog", { name: "Change regular week" })).toBeVisible();
    await visit(STARTING_LATER);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add a schedule…" }).click();
    await expect(page.getByRole("textbox", { name: /Schedule name/ })).toBeVisible();
    await visit(ADD_SCHEDULE);
    await page.keyboard.press("Escape");
    await layerOption(page, "Special dates").click();
    await expect(layerOption(page, "Special dates")).toBeChecked();
    await visit("Special dates layer");
    await layerOption(page, "Calendar").click();
    await expect(page.getByRole("grid")).toBeVisible();
    await visit("Calendar layer");
    await page
      .locator(`[data-date="${localDay(2)}"]`)
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await visit("Day drawer");
    await page.getByRole("dialog").getByRole("button", { name: "Edit Dinner" }).click();
    await expect(page.getByRole("button", { name: "Copy hours…" })).toBeVisible();
    await visit(DAY_EDITOR);
    await page.keyboard.press("Escape");
    await page.goto("availability?tab=calendar");
    await page.getByRole("button", { name: "Close…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Close / })).toBeVisible();
    await visit(PRIMARY_CLOSE);
    await page.keyboard.press("Escape");
    // Booking rules has its own address under the hub (availability-hub C2.5), not a ⋯ entry.
    await page.goto("availability/booking-rules");
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toBeVisible();
    await visit(PRIMARY_BOOKING);
    await page.keyboard.press("Escape");
    await page.goto("floor-plans");
    await page.getByRole("button", { name: /New Floor Plan/i }).click();
    await expect(page.getByRole("dialog", { name: /floor plan/i })).toBeVisible();
    await visit(PRIMARY_NEW_FLOOR_PLAN);
    await page.keyboard.press("Escape");
    await page.goto("floor-plans/fp_e2e_001");
    await expect(page.getByRole("button", { name: /Add Table/i })).toBeVisible();
    await visit(PRIMARY_FLOOR_PLAN_EDITOR);
    await mockEmptyVenue(page, { derive: true });
    await page.goto("availability/calendar");
    await expect(page.getByRole("heading", { name: "Set your regular week" })).toBeVisible();
    await visit(QUICK_SETUP_CARD);

    const rows = RESOURCE_TYPES.map((type) => {
      const where = hosts.get(type) ?? [];
      const inFlow = IN_FLOW[type];
      return {
        type,
        where,
        inFlow,
        // A surface hosting the form that is neither the primary editor nor a frame opened from it.
        extra: where.filter(
          (surface) => surface !== PRIMARY_EDITOR[type] && !inFlow.includes(surface)
        ),
      };
    });
    test.info().annotations.push({
      type: "editors per resource type (before @ 7c051456f / after)",
      description: rows
        .map(
          (row) =>
            `${row.type}: ${BEFORE_7C051456F[row.type].count} / ${1 + row.extra.length}` +
            ` (surfaces hosting the form after: ${row.where.length})`
        )
        .join("; "),
    });
    for (const row of rows) {
      // The primary editor hosts the form, each declared frame really hosts it (no stale entry),
      // and nothing else does: the "after" count is the primary plus any surface that is neither.
      expect(row.where, row.type).toContain(PRIMARY_EDITOR[row.type]);
      expect(row.where, row.type).toEqual(expect.arrayContaining([...row.inFlow]));
      expect(row.extra, row.type).toEqual([]);
      expect(1 + row.extra.length, row.type).toBe(1);
      expect(BEFORE_7C051456F[row.type].surfaces, row.type).toHaveLength(
        BEFORE_7C051456F[row.type].count
      );
    }
  });

  test("(b) an empty venue: a two-service varied week in quick setup, then one section blocked for one date", async ({
    mockedPage: page,
  }) => {
    test.slow();
    await mockBarSection(page);
    const venue = await mockEmptyVenue(page, { derive: true });
    await page.goto("availability/calendar");
    await expect(page.getByRole("heading", { name: "Set your regular week" })).toBeVisible();
    const quickSetup = countInteractions(page);

    // Lunch Mon–Fri, Dinner Tue–Sun closing 12:00 AM on Fri–Sat (the demo week without Brunch).
    await setTwoServiceVariedWeek(quickSetup.page);
    await quickSetup.page.getByRole("button", { name: "Save and open bookings" }).click();
    await expect.poll(() => venue.savedBody()).not.toBeNull();
    // No more interactions than the same script on the unchanged quick-setup form of 7c051456f
    // (14, Save included); measured on a throwaway worktree, see the PR body.
    test.info().annotations.push({
      type: "interactions (agent stand-in)",
      description: `(b) two-service varied week in quick setup: ${quickSetup.count()} (7c051456f: ${TWO_SERVICE_VARIED_WEEK_BASELINE_7C051456F})`,
    });
    expect(quickSetup.count()).toBeLessThanOrEqual(TWO_SERVICE_VARIED_WEEK_BASELINE_7C051456F);

    // Then block one named section for one date, through the entry the hub uses.
    const closeDay = nextMonthDay(24);
    const closures = await mockClosures(page);
    await page.goto("availability?from=setup&closeSection=sec-bar");
    const dialog = page.getByRole("dialog", { name: /^Close / });
    await expect(dialog.getByText("One section: Bar", { exact: true })).toBeVisible();
    await dialog.getByRole("combobox", { name: "Date" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(page, closeDay).click();
    await dialog.getByTestId("close-primary").click();
    await expect.poll(() => closures.saved()).not.toBeNull();
    expect(closures.saved()).toMatchObject({
      rule: { kind: "closure", targetKind: "tables", sectionId: "sec-bar", startsOn: closeDay },
    });
  });

  test("(c) Tonight, Compare services, History, Booking rules, Change regular week, Copy day, Special dates and the guest-view strip are reachable and act", async ({
    mockedPage: page,
  }) => {
    const puts = await captureConfigPuts(page);
    await mockNoopPreview(page);

    // Booking rules: the hub's row 5, at its own address (availability-hub C2.5).
    await page.goto("availability");
    await page.getByRole("link", { name: "Edit Booking rules" }).click();
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Booking rules" })).toHaveCount(0);
    // History: the hub's History link, a drawer at its own address (availability-hub C2.6).
    // Its own Close button, not Escape: Escape pressed before the drawer has taken focus is lost.
    await page.getByRole("link", { name: "History" }).click();
    const history = page.getByRole("dialog", { name: "History" });
    await history.getByRole("button", { name: "Close" }).click();
    await expect(history).toHaveCount(0);
    await firstPaint(page);

    // Guest-view strip: one closed row under the week form until the Manager asks for it.
    await weekPanel(page).getByRole("button", { name: "Guest preview" }).click();
    const strip = page.getByRole("complementary", { name: "Guest preview" });
    await expect(strip).toBeVisible();

    // Compare services: the header ⋯.
    const more = page.getByRole("button", { name: "More actions" });
    await more.click();
    await page.getByRole("menuitem", { name: "Compare services" }).click();
    await expect(page.getByRole("heading", { name: "Compare services" })).toBeVisible();

    // Change regular week: edit in place and save (today's date), no drawer.
    await weekPanel(page)
      .getByRole("button", { name: /^Dinner ?, / })
      .click();
    await weekPanel(page).getByRole("combobox", { name: "Closes" }).first().click();
    await page
      .getByRole("listbox", { name: "Closes" })
      .getByRole("option", { name: "10:00 PM", exact: true })
      .click();
    await weekPanel(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => puts.bodies().length).toBe(1);

    // Special dates: one interaction from the first layer.
    await layerOption(page, "Special dates").click();
    await expect(layerOption(page, "Special dates")).toBeChecked();

    // Copy day: inside the day drawer on the Calendar layer.
    await layerOption(page, "Calendar").click();
    await page
      .locator(`[data-date="${localDay(2)}"]`)
      .first()
      .click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit Dinner" }).click();
    await expect(page.getByRole("button", { name: "Copy hours…" })).toBeVisible();
  });

  test("(c) Tonight is one click from the Timeline header", async ({ mockedPage: page }) => {
    await page.goto("timeline");
    await page.getByRole("button", { name: /^Tonight(?!'s)/ }).click();
    await expect(page.getByRole("button", { name: "Apply", exact: true }).first()).toBeVisible();
  });

  test("(e) a Host sees no editor on the hub, the nav or the Availability page", async ({
    mockedPage: page,
  }) => {
    await mockEmptyVenue(page, { derive: true });
    await viewAsHost(page);
    await page.goto("setup");
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("button", {
        name: /set up|edit|change|close|add|move|rules|compare|create|open/i,
      })
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation").getByRole("button", { name: /set up|edit|close|add/i })
    ).toHaveCount(0);
  });

  test("(e) a Host is sent from the floor plan editor routes back to Venue Setup", async ({
    mockedPage: page,
  }) => {
    await viewAsHost(page);
    for (const path of ["floor-plans", "floor-plans/fp_e2e_001"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/setup$/);
      await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    }
  });

  test("(e) a Host's Availability page is read-only: Calendar and Special dates, Go to date only", async ({
    mockedPage: page,
  }) => {
    await viewAsHost(page);
    await page.goto("availability/calendar");
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(layerOption(page, "Schedules")).toHaveCount(0);
    await expect(page.getByTestId("week-panel")).toHaveCount(0);
    for (const name of ["Close…", "Pause online booking", "Add a schedule…"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Go to date"]);
  });
});

test.describe("First paint and night-of actions (PRD 15, 21)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("PRD 15: a Manager's first paint has at most 9 actionable controls outside the week panel", async ({
    mockedPage: page,
  }) => {
    await firstPaint(page);
    const { count, controls } = await countFirstPaintControls(page, weekPanel(page));

    test.info().annotations.push({
      type: "first paint controls (agent stand-in)",
      description: `${count} outside the week panel: ${controls.join(" | ")}`,
    });
    // 9, not 8 (availability-phone-tonight prd.md criterion 4): the Today line's "Change tonight"
    // link is one control. (8, not 7, since availability-scenario-ux: the Booking line is a button.)
    expect(count, controls.join("\n")).toBeLessThanOrEqual(9);
    // Every control removed from first paint is one interaction away (PRD 7): a visible
    // "Add a schedule…" is how a one-schedule Manager learns schedules exist (PRD 19).
    expect(controls).toContain("button: Add a schedule…");
  });

  test("PRD 21: Close… and Pause online booking are one interaction on a desktop", async ({
    mockedPage: page,
  }) => {
    await mockClosures(page, {});
    await firstPaint(page);
    const counter = countInteractions(page);

    await counter.page.getByRole("button", { name: "Close…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Close / })).toBeVisible();
    expect(counter.count()).toBe(1);

    await page.keyboard.press("Escape");
    await counter.page.getByRole("button", { name: "Pause online booking" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(counter.count()).toBe(2); // one each
  });

  test("PRD 21: on a 375x812 phone Close… is one interaction and Pause online booking two", async ({
    mockedPage: page,
  }) => {
    await page.setViewportSize(PHONE);
    await mockClosures(page, {});
    await firstPaint(page);
    const close = countInteractions(page);
    await close.page.getByRole("button", { name: "Close…", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Close / })).toBeVisible();
    expect(close.count()).toBe(1);

    await page.keyboard.press("Escape");
    const pause = countInteractions(page);
    await pause.page.getByRole("button", { name: "More actions" }).click();
    await pause.page.getByRole("menuitem", { name: "Pause online booking" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(pause.count()).toBe(2);
  });
});

test.describe("The demo runs as written (PRD 23)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("onboarding's week is the first thing /availability shows; schedules and special dates are one layer down", async ({
    mockedPage: page,
  }) => {
    test.slow();
    await mockEmptyVenue(page, { derive: true });
    await mockNoopPreview(page);
    await page.goto("availability/calendar");
    await setUniformBistroWeek(page); // Lunch and Dinner Mon–Fri through quick setup
    await page.goto("availability/calendar");

    // After: the same first layer onboarding had, filled with the saved week and the guest strip.
    const panel = weekPanel(page);
    await expect(panel).toBeVisible();
    await expect(layerOption(page, "Schedules")).toBeChecked();
    await expect(panel.getByRole("button", { name: /^Lunch ?, 11:30 AM/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: /^Dinner ?, 5:00 PM/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Guest preview" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // First paint meets criterion 15.
    const { count, controls } = await countFirstPaintControls(page, panel);
    expect(count, controls.join("\n")).toBeLessThanOrEqual(9);

    // Special dates: one interaction down, one interaction back to the same first layer.
    const down = countInteractions(page);
    await layerOption(down.page, "Special dates").click();
    expect(down.count()).toBe(1);
    await expect(layerOption(page, "Special dates")).toBeChecked();
    await layerOption(page, "Schedules").click();
    await expect(panel.locator('button[id$="-line-header"]')).toHaveCount(2);

    // Schedules: one interaction to the editor, closed again, the same first layer.
    const schedules = countInteractions(page);
    await schedules.page.getByRole("button", { name: "Add a schedule…" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("textbox", { name: /Schedule name/ })).toBeVisible();
    expect(schedules.count()).toBe(1);
    await drawer.getByRole("button", { name: "Cancel" }).click();
    await expect(drawer).toBeHidden();
    await panel.getByRole("button", { name: /^Lunch ?, / }).click();
    await expect(panel.getByRole("textbox", { name: "Service name" }).first()).toHaveValue("Lunch");
  });
});

test.describe("The demo runs as written (PRD 9)", () => {
  test.beforeEach(async ({ mockedPage }) => {
    await pinToday(mockedPage);
  });

  test("the hub fills in as the Manager sets up: a two-service varied week, then one section blocked for one date", async ({
    mockedPage: page,
  }) => {
    test.slow();
    const sections = await mockBarSection(page, { present: false });
    const venue = await mockEmptyVenue(page, { derive: true });
    await withoutBookingRules(page);

    // The setup surface on the empty venue: every node is there and marked not set up.
    await page.goto("setup");
    await expect(page.getByRole("heading", { level: 1, name: "Venue Setup" })).toBeVisible();
    for (const name of [/Regular week/, /Special dates/, /^Booking/, /Floor plan/]) {
      await expect(page.getByRole("listitem", { name }).getByText("Not set up")).toBeVisible();
    }

    // The primary action opens the one editor; set the two-service varied week and save.
    await page.getByRole("button", { name: "Set up regular week" }).click();
    await expect(page.getByRole("heading", { name: "Set your regular week" })).toBeVisible();
    await setTwoServiceVariedWeek(page);
    await page.getByRole("button", { name: "Save and open bookings" }).click();
    await expect.poll(() => venue.savedBody()).not.toBeNull();

    // The guest-view strip shows the result of the week just set (a closed row until asked).
    await weekPanel(page).getByRole("button", { name: "Guest preview" }).click();
    const strip = page.getByRole("complementary", { name: "Guest preview" });
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("Lunch");
    await expect(strip).toContainText("Dinner");

    // The hours, schedule and service nodes update without leaving the app.
    const hub = await openHubWithConfig(page);
    await expect(hub.schedules).toContainText("1 schedule");
    await expect(hub.schedules).toContainText("Lunch");
    await expect(hub.schedules).toContainText("Dinner");

    // Add one section, and block it for one date from the hub.
    await mockMainFloorPlan(page);
    sections.add();
    const closures = await mockClosures(page, { config: hub.served });
    const closeDay = nextMonthDay(24);
    await page.goto("setup");
    await expect(page.getByRole("listitem", { name: /Main Floor/ })).toBeVisible();
    await expect(page.getByRole("listitem", { name: /Bar/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Close for a date… Bar" }).click();
    const dialog = page.getByRole("dialog", { name: /^Close / });
    await expect(dialog.getByText(/^One section: /)).toBeVisible();
    await dialog.getByRole("combobox", { name: "Date" }).click();
    await page.getByRole("button", { name: "Next month" }).click();
    await pickerDay(page, closeDay).click();
    await dialog.getByTestId("close-primary").click();
    await expect.poll(() => closures.saved()).not.toBeNull();

    // The Special dates node names the section, not a table list, and opens its one editor.
    await page.goto("setup");
    const special = page.getByRole("listitem", { name: /Special dates/ });
    await expect(special).toContainText("Bar");
    await page.getByRole("button", { name: "Open Special dates" }).click();
    await expect(page).toHaveURL(/\/availability\/calendar\?tab=special/);
    await expect(page.getByRole("main")).toContainText("Bar");
  });
});
