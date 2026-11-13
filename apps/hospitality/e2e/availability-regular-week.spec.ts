import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { mockEmptyVenue } from "./helpers/empty-venue-mock.js";
import { weekPanel } from "./helpers/first-paint.js";
import { dinnerOnlyConfig, mockNoopPreview } from "./helpers/scenario-fixtures.js";
import { atLocal, localDay } from "./local-day.js";

/**
 * F-UW (docs/features/venue-availability/ux.md): Change regular week must not open days the
 * venue is closed on, and Escape on a drawer with unsaved edits asks before throwing them away.
 * The venue runs Tuesday to Saturday, so Sunday (0) and Monday (1) have no assignment.
 */

const TUE_SAT = [2, 3, 4, 5, 6];
const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d <= new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function mockTueSatVenue(page: Page, dateRules: unknown[] = []) {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  let saved: { changes: { upsert: { assignments?: Array<{ weekdays: number[] }> } } } | null = null;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });

  await page.route(`${base}/availability/config`, (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      return route.fulfill(json({ version: 8, changeId: "change-1" }));
    }
    return route.fulfill(
      json({
        config: {
          schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
          venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
          scheduleServices: [
            {
              id: "ss-dinner",
              scheduleId: "regular",
              venueServiceId: "vs-dinner",
              ...DINNER,
              seating: { version: 1, interval: 15 },
              bookingTypes: ["online", "phone"],
            },
          ],
          assignments: [{ id: "as", scheduleId: "regular", weekdays: TUE_SAT, precedence: 0 }],
          dateRules,
        },
        version: 7,
        source: "rows",
      })
    );
  });
  await page.route(`${base}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const days = datesBetween(url.searchParams.get("from")!, url.searchParams.get("to")!).map(
      (serviceDate) => {
        const open = TUE_SAT.includes(new Date(`${serviceDate}T00:00:00Z`).getUTCDay());
        return {
          serviceDate,
          label: open ? "Regular week" : "Closed",
          scheduleId: open ? "regular" : null,
          serviceCount: open ? 1 : 0,
          closures: [],
          bookingOpen: { online: open, phone: open, waitlist: open },
        };
      }
    );
    return route.fulfill(json(days));
  });
  return { savedBody: () => saved };
}

test.describe("Change regular week (F-UW)", () => {
  test("a Tuesday to Saturday venue keeps Sunday and Monday closed", async ({ mockedPage }) => {
    const state = await mockTueSatVenue(mockedPage);
    await mockedPage.goto("availability?tab=schedules");

    await mockedPage.getByRole("button", { name: "Starting later…" }).click();
    await expect(
      mockedPage.getByText("This becomes your regular week: open Tue–Sat.")
    ).toBeVisible();

    await mockedPage.getByLabel("Starting").click();
    // The page's own calendar also has a button with this data-date, behind the drawer; only the
    // date picker's cell is a gridcell itself.
    await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
    await mockedPage.getByRole("button", { name: /^Save hours from/ }).click();

    await expect.poll(() => state.savedBody()).not.toBeNull();
    const weekdays = state.savedBody()?.changes.upsert.assignments?.[0]?.weekdays;
    expect(weekdays).toEqual(TUE_SAT);
    expect(weekdays).not.toContain(0);
    expect(weekdays).not.toContain(1);
  });

  test("Escape on a drawer with unsaved edits asks first", async ({ mockedPage }) => {
    await mockTueSatVenue(mockedPage);
    await mockedPage.goto("availability?tab=schedules");

    const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
    await mockedPage.getByRole("button", { name: "Starting later…" }).click();
    await expect(drawer).toBeVisible();
    // The week panel behind the drawer has the same fields: type in the drawer's.
    await drawer.getByRole("textbox", { name: "Service name" }).first().fill("Dinner late");

    await mockedPage.keyboard.press("Escape");
    const ask = mockedPage.getByRole("alertdialog", { name: "Discard your changes?" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expect(drawer.getByRole("textbox", { name: "Service name" }).first()).toHaveValue(
      "Dinner late"
    );

    await mockedPage.keyboard.press("Escape");
    await mockedPage
      .getByRole("alertdialog", { name: "Discard your changes?" })
      .getByRole("button", { name: "Discard" })
      .click();
    await expect(drawer).toBeHidden();
  });

  test("Cancel asks first, and the prompt's buttons are clickable above the drawer", async ({
    mockedPage,
  }) => {
    await mockTueSatVenue(mockedPage);
    await mockedPage.goto("availability?tab=schedules");

    const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
    await mockedPage.getByRole("button", { name: "Starting later…" }).click();
    await drawer.getByRole("textbox", { name: "Service name" }).first().fill("Dinner late");

    await drawer.getByRole("button", { name: "Cancel" }).click();
    const ask = mockedPage.getByRole("alertdialog", { name: "Discard your changes?" });
    await expect(ask).toBeVisible();
    // A real click: the prompt must stack above the drawer's overlay, not under it.
    await ask.getByRole("button", { name: "Discard" }).click();
    await expect(drawer).toBeHidden();
    await expect(ask).toBeHidden();
  });

  // F-UW.2 (#7982): the guest preview and the bookings the change would strand, before Save.
  test.describe("preview before saving", () => {
    const previewResult = {
      version: 7,
      days: [{ serviceDate: localDay(), added: [], removed: [1350] }],
      focusDay: {
        serviceDate: localDay(),
        label: "Special hours",
        scheduleId: null,
        closures: [],
        bookingOpen: { online: true, phone: true, waitlist: false },
        serviceCount: 1,
        services: [
          {
            venueServiceId: "vs-dinner",
            name: "Dinner",
            opensAt: 1020,
            lastSeatingAt: 1260,
            closesAt: 1380,
          },
        ],
      },
      stranded: {
        total: 1,
        offset: 0,
        items: [
          {
            id: "res-1",
            startTime: atLocal("22:30", localDay(1)),
            partySize: 4,
            reason: "outside_service",
          },
        ],
      },
    };

    const viewports = [
      { name: "desktop", size: { width: 1280, height: 720 } },
      { name: "phone", size: { width: 375, height: 812 } },
    ];
    for (const { name, size } of viewports) {
      test(`shows what guests will see and the stranded bookings, and fits (${name})`, async ({
        mockedPage,
      }) => {
        await mockedPage.setViewportSize(size);
        await mockTueSatVenue(mockedPage);
        await mockedPage.route("**/availability/preview*", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: previewResult }),
          })
        );
        await mockedPage.goto("availability?tab=schedules");
        await mockedPage.getByRole("button", { name: "Starting later…" }).click();
        const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
        await expect(drawer.getByText(/Make a change to see what guests will see/)).toBeVisible();

        await mockedPage.getByLabel("Starting").click();
        await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();

        await expect(drawer.getByText("Guest preview")).toBeVisible();
        const stranded = drawer.getByText("1 booking would fall outside these hours");
        await stranded.scrollIntoViewIfNeeded();
        await expect(stranded).toBeVisible();
        await expect(drawer.getByText(/party of 4/)).toBeVisible();

        // Fits: nothing in the drawer scrolls sideways (the service lines' clipped, visually hidden
        // separators are not content), and Save is still on screen.
        const overflow = await drawer.evaluate((el) => {
          const scrollers = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))];
          return scrollers
            .filter(
              (n) =>
                n.scrollWidth > n.clientWidth + 1 &&
                n.clientWidth > 0 &&
                !n.className.toString().includes("visuallyHidden")
            )
            .map((n) => `${n.tagName}.${n.className} ${n.scrollWidth}>${n.clientWidth}`);
        });
        expect(overflow).toEqual([]);
        await expect(mockedPage.getByRole("button", { name: /^Save hours from/ })).toBeInViewport();

        const results = await new AxeBuilder({ page: mockedPage })
          .include('[role="dialog"]')
          .analyze();
        expect(results.violations).toEqual([]);
      });
    }

    test("fits a phone in French, where the labels run longest", async ({ mockedPage }) => {
      await mockedPage.setViewportSize({ width: 375, height: 812 });
      await mockTueSatVenue(mockedPage);
      await mockedPage.route("**/availability/preview*", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: previewResult }),
        })
      );
      await mockedPage.addInitScript(() => localStorage.setItem("mbe-hospitality-locale", "fr-CA"));
      await mockedPage.goto("availability?tab=schedules");
      await mockedPage.getByRole("button", { name: "Commencer plus tard…" }).click();
      const drawer = mockedPage.getByRole("dialog").first();
      await mockedPage.getByLabel(/^Début/).click();
      await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
      const stranded = drawer.getByText("1 réservation serait hors de ces heures");
      await stranded.scrollIntoViewIfNeeded();
      await expect(stranded).toBeVisible();
      await expect(drawer.getByText("Semaine habituelle").first()).toBeVisible();

      const wide = await drawer.evaluate((root) =>
        [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
          .filter(
            (n) =>
              n.clientWidth > 0 &&
              n.scrollWidth > n.clientWidth + 1 &&
              !String(n.className).includes("visuallyHidden")
          )
          .map(
            (n) =>
              `${n.tagName}.${String(n.className).slice(0, 30)} ${n.scrollWidth}>${n.clientWidth}`
          )
      );
      expect(wide).toEqual([]);
    });

    test("a failed preview says so and Save still works", async ({ mockedPage }) => {
      const state = await mockTueSatVenue(mockedPage);
      await mockedPage.route("**/availability/preview*", (route) =>
        route.fulfill({ status: 500, contentType: "application/problem+json", body: "{}" })
      );
      await mockedPage.goto("availability?tab=schedules");
      await mockedPage.getByRole("button", { name: "Starting later…" }).click();
      await mockedPage.getByLabel("Starting").click();
      await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();

      await expect(mockedPage.getByText("Preview unavailable")).toBeVisible();
      await expect(mockedPage.getByText(/You can still save/)).toBeVisible();
      await mockedPage.getByRole("button", { name: /^Save hours from/ }).click();
      await expect.poll(() => state.savedBody()).not.toBeNull();
    });
  });
});

/** The last day of the current month: far down a month grid, and still ahead of today. */
function lastDayOfThisMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString("en-CA");
}

/** Local calendar date of `day` in the current month, as `YYYY-MM-DD`. */
function dayOfThisMonth(day: number): string {
  const d = new Date();
  d.setDate(day);
  return d.toLocaleDateString("en-CA");
}

// #7981: Go to date (toolbar) and Use other hours (day drawer, #8691), at both widths and locales.
test.describe("navigation and day-drawer controls (#7981)", () => {
  const EN = {
    locale: "en-US",
    more: "More actions",
    goTo: "Go to date",
    go: "Go",
    date: "Date",
    use: "Use other hours…",
    useTitle: "Use another day’s hours",
    from: "Copy hours from",
  };
  const FR = {
    locale: "fr-CA",
    more: "Plus d’actions",
    goTo: "Aller à une date",
    go: "Aller",
    date: "Date",
    use: "Utiliser d’autres heures…",
    useTitle: "Utiliser les heures d’un autre jour",
    from: "Copier les heures du",
  };
  const SIZES = [
    { name: "desktop", size: { width: 1280, height: 720 } },
    { name: "phone", size: { width: 375, height: 812 } },
  ];
  const cases = SIZES.flatMap((s) => [EN, FR].map((words) => ({ ...s, ...words })));
  for (const c of cases) {
    test(`Go to date moves the calendar (${c.name}, ${c.locale})`, async ({ mockedPage }) => {
      await mockedPage.setViewportSize(c.size);
      await mockTueSatVenue(mockedPage);
      await mockedPage.addInitScript(
        (locale) => localStorage.setItem("mbe-hospitality-locale", locale),
        c.locale
      );
      await mockedPage.goto("availability?tab=calendar");
      await mockedPage.getByRole("button", { name: c.more }).click();
      await mockedPage.getByRole("menuitem", { name: c.goTo }).click();
      const dialog = mockedPage.getByRole("dialog", { name: c.goTo });
      await expect(dialog).toBeVisible();
      // The picker opens on this month; the last day is far down the grid or the agenda.
      const target = lastDayOfThisMonth();
      await dialog.getByLabel(c.date).click();
      await mockedPage.locator(`[role="gridcell"][data-date="${target}"]`).click();
      // The popover's own cells are the only gridcells that carry a date; none is left once it shuts.
      await expect(mockedPage.locator('[role="gridcell"][data-date]')).toHaveCount(0);
      await dialog.evaluate((el) => el.setAttribute("data-axe-scope", ""));
      const results = await new AxeBuilder({ page: mockedPage })
        .include("[data-axe-scope]")
        .analyze();
      expect(results.violations).toEqual([]);
      await dialog.getByRole("button", { name: c.go, exact: true }).click();
      await expect(dialog).toBeHidden();
      // Focus lands on the day itself, which is really on screen (toBeVisible passes off screen).
      const cell = mockedPage.locator(`button[data-date="${target}"]`);
      await expect(cell).toBeFocused();
      await expect(cell).toBeInViewport({ ratio: 1 });
    });

    test(`Escape on Go to date puts focus back on the menu button (${c.name}, ${c.locale})`, async ({
      mockedPage,
    }) => {
      await mockedPage.setViewportSize(c.size);
      await mockTueSatVenue(mockedPage);
      await mockedPage.addInitScript(
        (locale) => localStorage.setItem("mbe-hospitality-locale", locale),
        c.locale
      );
      await mockedPage.goto("availability?tab=calendar");
      const more = mockedPage.getByRole("button", { name: c.more });
      await more.click();
      await mockedPage.getByRole("menuitem", { name: c.goTo }).click();
      const dialog = mockedPage.getByRole("dialog", { name: c.goTo });
      await expect(dialog).toBeVisible();
      // Visible is not yet listening: the dialog paints (at opacity 0) a commit before its effects
      // attach the Escape handler and move focus in. Focus inside is the sign it is ready, and
      // an Escape sent earlier is dropped, leaving the dialog open for good.
      await expect(dialog.getByLabel(c.date)).toBeFocused();
      await mockedPage.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(more).toBeFocused();
    });

    test(`Use another day's hours saves one date against the loaded version (${c.name}, ${c.locale})`, async ({
      mockedPage,
    }) => {
      await mockedPage.setViewportSize(c.size);
      await mockTueSatVenue(mockedPage);
      let sent: {
        expectedVersion: number;
        changes: { upsert: { dateRules?: Array<{ startsOn: string }> } };
      } | null = null;
      await mockedPage.route("**/availability/config", (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        sent = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { version: 8, changeId: "change-2" } }),
        });
      });
      await mockedPage.route("**/availability/preview*", (route) =>
        route.fulfill({ status: 500, contentType: "application/problem+json", body: "{}" })
      );
      await mockedPage.addInitScript(
        (locale) => localStorage.setItem("mbe-hospitality-locale", locale),
        c.locale
      );
      await mockedPage.goto("availability?tab=calendar");
      const day = localDay(1);
      // Phone and tablet list the days; the grid is desktop only. Either way the date is a button.
      await mockedPage.locator(`button[data-date="${day}"]`).click();
      const drawer = mockedPage.getByRole("dialog").first();
      await drawer.getByRole("button", { name: c.use }).click();
      const dialog = mockedPage.getByRole("dialog", { name: c.useTitle });
      await expect(dialog).toBeVisible();
      // A Tuesday to Saturday day in this month other than the target, so it has hours to copy.
      let source = 1;
      while (
        !TUE_SAT.includes(new Date(`${dayOfThisMonth(source)}T00:00:00`).getDay()) ||
        dayOfThisMonth(source) === day
      ) {
        source += 1;
      }
      await dialog.getByLabel(c.from).click();
      await mockedPage.locator(`[role="gridcell"][data-date="${dayOfThisMonth(source)}"]`).click();
      await expect(mockedPage.locator('[role="gridcell"][data-date]')).toHaveCount(0);
      await dialog.evaluate((el) => el.setAttribute("data-axe-scope", ""));
      const results = await new AxeBuilder({ page: mockedPage })
        .include("[data-axe-scope]")
        .analyze();
      expect(results.violations).toEqual([]);
      await dialog.getByRole("button", { name: /^(Apply to|Appliquer à) 1 date$/ }).click();
      await expect.poll(() => sent).not.toBeNull();
      expect(sent!.expectedVersion).toBe(7);
      expect(sent!.changes.upsert.dateRules?.every((r) => r.startsOn === day)).toBe(true);
    });
  }
});

/**
 * Today if it is a Tuesday to Saturday, else the Saturday just gone, so the date has regular
 * hours under its rule. The test holds the clock at local noon on it (`holdClockOn`), which makes
 * it the app's today: inside the month the calendar opens on, and not a read-only past date. A
 * day ahead can fall in next month, which neither the month view nor the phone list renders
 * (28 to 30 Nov 2026), and a clock held ahead of the real one ends the session, so the day is
 * never later than today.
 */
function latestOpenDay(): string {
  for (let back = 0; back <= 2; back += 1) {
    const day = localDay(-back);
    if (TUE_SAT.includes(new Date(`${day}T00:00:00`).getDay())) return day;
  }
  throw new Error("no open day in the last three");
}

/** Noon on a UTC or American runner is the same calendar day in the venue's zone (New York). */
async function holdClockOn(page: Page, day: string): Promise<void> {
  await page.clock.setFixedTime(new Date(`${day}T12:00:00`));
}

// #7981: Remove and Edit in the drawer's "Why this day", at both widths and locales.
test.describe("Why this day: Remove and Edit special hours (#7981)", () => {
  const EN = {
    locale: "en-US",
    remove: /^Remove special hours/,
    removeTitle: /^Remove special hours/,
    confirm: "Remove",
    edit: /^Edit hours for/,
    service: /^Edit Dinner/,
  };
  const FR = {
    locale: "fr-CA",
    remove: /^Retirer l’horaire spécial/,
    removeTitle: /^Retirer l’horaire spécial/,
    confirm: "Retirer",
    edit: /^Modifier l’horaire du/,
    service: /^Modifier Dinner/,
  };
  const SIZES = [
    { name: "desktop", size: { width: 1280, height: 720 } },
    { name: "phone", size: { width: 375, height: 812 } },
  ];
  const specialHours = (day: string) => ({
    id: "sh-1",
    kind: "special_hours",
    targetKind: "venue",
    startsOn: day,
    endsOn: day,
    payload: {
      version: 1,
      services: [
        {
          venueServiceId: "vs-dinner",
          opensAt: 1020,
          lastSeatingAt: 1200,
          closesAt: 1320,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ],
    },
  });

  for (const s of SIZES) {
    for (const c of [EN, FR]) {
      const label = `${s.name}, ${c.locale}`;

      test(`Remove asks with an alertdialog, then saves against the loaded version (${label})`, async ({
        mockedPage,
      }) => {
        await mockedPage.setViewportSize(s.size);
        const day = latestOpenDay();
        await holdClockOn(mockedPage, day);
        await mockTueSatVenue(mockedPage, [specialHours(day)]);
        let sent: {
          expectedVersion: number;
          changes: { remove: { dateRules?: string[] } };
        } | null = null;
        await mockedPage.route("**/availability/config", (route) => {
          if (route.request().method() !== "PUT") return route.fallback();
          sent = route.request().postDataJSON();
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: { version: 8, changeId: "change-3" } }),
          });
        });
        await mockedPage.route("**/availability/preview*", (route) =>
          route.fulfill({ status: 500, contentType: "application/problem+json", body: "{}" })
        );
        await mockedPage.addInitScript(
          (locale) => localStorage.setItem("mbe-hospitality-locale", locale),
          c.locale
        );
        await mockedPage.goto("availability?tab=calendar");
        await mockedPage.locator(`button[data-date="${day}"]`).click();
        const drawer = mockedPage.getByRole("dialog").first();
        const remove = drawer.getByRole("button", { name: c.remove });
        await remove.scrollIntoViewIfNeeded();
        await expect(remove).toBeInViewport();
        const drawerAxe = await new AxeBuilder({ page: mockedPage })
          .include('[role="dialog"]')
          .analyze();
        expect(drawerAxe.violations).toEqual([]);

        await remove.click();
        const ask = mockedPage.getByRole("alertdialog", { name: c.removeTitle });
        await expect(ask).toBeVisible();
        // Not the dialog's fade-in half way through. Polled for its end state rather than awaiting
        // each `Animation.finished`: framer-motion (motion-dom's NativeAnimation) calls `cancel()`
        // on its own WAAPI animation when it finishes or is interrupted, and a cancelled
        // animation's `finished` rejects with AbortError.
        await expect
          .poll(() =>
            ask.evaluate(
              (el) =>
                getComputedStyle(el).opacity === "1" &&
                el.getAnimations({ subtree: true }).every((a) => a.playState !== "running")
            )
          )
          .toBe(true);
        // rialto's destructive ConfirmDialog button is #1a1918 on #b84a3c, 3.41:1 (below AA). That is
        // the component's own colour pair, not this change's, so axe skips the one button and still
        // reads the rest of the dialog; the defect is reported on #7981.
        const confirm = ask.getByRole("button", { name: c.confirm, exact: true });
        await confirm.evaluate((el) => el.setAttribute("data-axe-skip", ""));
        const askAxe = await new AxeBuilder({ page: mockedPage })
          .include('[role="alertdialog"]')
          .exclude("[data-axe-skip]")
          .analyze();
        expect(askAxe.violations).toEqual([]);
        await ask.getByRole("button", { name: c.confirm, exact: true }).click();
        await expect.poll(() => sent).not.toBeNull();
        expect(sent!.expectedVersion).toBe(7);
        expect(sent!.changes.remove.dateRules).toEqual(["sh-1"]);
        await expect(ask).toBeHidden();
      });

      test(`Edit moves focus to the day's editor, in view (${label})`, async ({ mockedPage }) => {
        await mockedPage.setViewportSize(s.size);
        const day = latestOpenDay();
        await holdClockOn(mockedPage, day);
        await mockTueSatVenue(mockedPage, [specialHours(day)]);
        await mockedPage.addInitScript(
          (locale) => localStorage.setItem("mbe-hospitality-locale", locale),
          c.locale
        );
        await mockedPage.goto("availability?tab=calendar");
        await mockedPage.locator(`button[data-date="${day}"]`).click();
        const drawer = mockedPage.getByRole("dialog").first();
        await drawer.getByRole("button", { name: c.edit }).click();
        // Edit opens the editor on its rows (#8752): the read view's "Edit Dinner" button is gone,
        // and focus is in the first field of the service's row.
        await expect(drawer.getByRole("button", { name: c.service })).toHaveCount(0);
        const editor = drawer.locator("fieldset input").first();
        await expect(editor).toBeFocused();
        await expect(editor).toBeInViewport({ ratio: 1 });
      });
    }
  }
});

// #7981: the name suggested from the dates in Change regular week (ux.md F-UW), both widths and locales.
test.describe("Change regular week: name suggestion (#7981)", () => {
  const SIZES = [
    { width: 1280, height: 720 },
    { width: 375, height: 812 },
  ];
  for (const size of SIZES) {
    for (const locale of ["en-US", "fr-CA"]) {
      test(`one tap fills the name (${size.width}px, ${locale})`, async ({ mockedPage }) => {
        const fr = locale === "fr-CA";
        const open = fr ? "Commencer plus tard…" : "Starting later…";
        await mockedPage.setViewportSize(size);
        await mockTueSatVenue(mockedPage);
        await mockedPage.addInitScript(
          (tag) => localStorage.setItem("mbe-hospitality-locale", tag),
          locale
        );
        await mockedPage.goto("availability?tab=schedules");
        await mockedPage.getByRole("button", { name: open }).click();
        // The name is asked for only when the change has an end date (it is then a named period).
        // Ending first, so no preview starts before the name is typed or suggested.
        await mockedPage.getByLabel(fr ? /^Fin/ : "Ending").click();
        await mockedPage.locator(`[role="gridcell"][data-date="${lastDayOfThisMonth()}"]`).click();
        await mockedPage.waitForFunction(() =>
          document.getAnimations().every((a) => a.playState !== "running")
        );
        await mockedPage.getByLabel(fr ? /^Début/ : "Starting").click();
        // The open calendar popover is part of what axe reads.
        // By its gridcells, not its name: the popover's label is "Popover" only in English.
        const grid = mockedPage.locator('[role="grid"]:has([role="gridcell"][data-date])');
        await expect(grid).toBeVisible();
        await mockedPage.waitForFunction(() =>
          document.getAnimations().every((a) => a.playState !== "running")
        );
        await grid.evaluate((el) =>
          (el.closest('[role="dialog"]') ?? el).setAttribute("data-axe-scope", "")
        );
        // A DatePicker popover opened in a Drawer is still the translucent glass panel (the opaque
        // fill of #8153 is scoped to a Dialog): its month label reads 4.01:1. A rialto defect,
        // reported on #7981, so colour contrast is left out here and every other rule still runs.
        const popover = await new AxeBuilder({ page: mockedPage })
          .include("[data-axe-scope]")
          .disableRules(["color-contrast"])
          .analyze();
        expect(popover.violations).toEqual([]);
        await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
        const chip = mockedPage.getByRole("button", { name: fr ? /^Utiliser « / : /^Use “/ });
        await chip.scrollIntoViewIfNeeded();
        await expect(chip).toBeInViewport();
        const dialog = mockedPage.getByRole("dialog").first();
        // The popover is still fading out: axe must not read it half way.
        await mockedPage.waitForFunction(() =>
          document.getAnimations().every((a) => a.playState !== "running")
        );
        await dialog.evaluate((el) => el.setAttribute("data-axe-scope-2", ""));
        const results = await new AxeBuilder({ page: mockedPage })
          .include("[data-axe-scope-2]")
          .analyze();
        expect(results.violations).toEqual([]);
        await chip.click();
        await expect(
          mockedPage.getByLabel(fr ? /^Nom de l’horaire/ : /Schedule name/)
        ).not.toHaveValue("");
        await expect(chip).toBeHidden();
      });
    }
  }
});

test.describe("Saving the regular week again and again (#8688)", () => {
  test("three saves on a one-schedule venue leave nothing under Other schedules", async ({
    mockedPage: page,
  }) => {
    await page.clock.setFixedTime(new Date(`${localDay()}T12:00:00`));
    // Each PUT is applied on top of the rows already saved, as the service does.
    await mockEmptyVenue(page, { derive: true, config: dinnerOnlyConfig() });
    await mockNoopPreview(page);
    await page.goto("availability?tab=schedules");
    const panel = weekPanel(page);
    await expect(panel).toBeVisible();

    for (const closes of ["10:30 PM", "11:00 PM", "11:30 PM"]) {
      // The services are closed lines (#8690): open Dinner's to reach its times.
      await panel.getByRole("button", { name: /^Dinner ?, /, expanded: false }).click();
      await panel.getByRole("combobox", { name: "Closes" }).first().click();
      await page
        .getByRole("listbox", { name: "Closes" })
        .getByRole("option", { name: closes, exact: true })
        .click();
      const put = page.waitForResponse(
        (r) => r.url().includes("/availability/config") && r.request().method() === "PUT"
      );
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      expect((await put).ok()).toBe(true);
      // The saved week restarts the form: Dinner is a closed line again, reading the new close.
      await expect(
        panel.getByRole("button", { name: new RegExp(`^Dinner ?, .*–${closes}`), expanded: false })
      ).toBeVisible();
      await expect(page.getByText("Other schedules", { exact: true })).toHaveCount(0);
    }
  });
});
