import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
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

async function mockTueSatVenue(page: Page) {
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
          dateRules: [],
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
    await mockedPage.goto("availability");

    await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
    await expect(mockedPage.getByText(/^Applies to Tue–Sat/)).toBeVisible();

    await mockedPage.getByLabel("Starting").click();
    // The page's own calendar also has a button with this data-date, behind the drawer; only the
    // date picker's cell is a gridcell itself.
    await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
    await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");
    await mockedPage.getByRole("button", { name: /^Save hours from/ }).click();

    await expect.poll(() => state.savedBody()).not.toBeNull();
    const weekdays = state.savedBody()?.changes.upsert.assignments?.[0]?.weekdays;
    expect(weekdays).toEqual(TUE_SAT);
    expect(weekdays).not.toContain(0);
    expect(weekdays).not.toContain(1);
  });

  test("Escape on a drawer with unsaved edits asks first", async ({ mockedPage }) => {
    await mockTueSatVenue(mockedPage);
    await mockedPage.goto("availability");

    const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
    await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
    await expect(drawer).toBeVisible();
    await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");

    await mockedPage.keyboard.press("Escape");
    const ask = mockedPage.getByRole("alertdialog", { name: "Discard your changes?" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expect(mockedPage.getByLabel(/Schedule name/)).toHaveValue("Summer hours");

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
    await mockedPage.goto("availability");

    const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
    await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
    await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");

    await mockedPage.getByRole("button", { name: "Cancel" }).click();
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
        await mockedPage.goto("availability");
        // On a phone the toolbar keeps this action in its More menu.
        if (size.width < 500) {
          await mockedPage.getByRole("button", { name: "More actions" }).click();
          await mockedPage.getByRole("menuitem", { name: "Change regular week…" }).click();
        } else {
          await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
        }
        const drawer = mockedPage.getByRole("dialog", { name: "Change regular week" });
        await expect(drawer.getByText(/Make a change to see what guests will see/)).toBeVisible();

        await mockedPage.getByLabel("Starting").click();
        await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
        await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");

        await expect(drawer.getByText("Guest preview")).toBeVisible();
        const stranded = drawer.getByText("1 booking would fall outside these hours");
        await stranded.scrollIntoViewIfNeeded();
        await expect(stranded).toBeVisible();
        await expect(drawer.getByText(/party of 4/)).toBeVisible();

        // Fits: nothing in the drawer scrolls sideways, and Save is still on screen.
        const overflow = await drawer.evaluate((el) => {
          const scrollers = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))];
          return scrollers
            .filter((n) => n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0)
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
      await mockedPage.goto("availability");
      await mockedPage.getByRole("button", { name: "Plus d’actions" }).click();
      await mockedPage.getByRole("menuitem", { name: /^Modifier la semaine habituelle/ }).click();
      const drawer = mockedPage.getByRole("dialog").first();
      await mockedPage.getByLabel(/^Début/).click();
      await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
      await mockedPage.getByLabel(/^Nom de l’horaire/).fill("Heures d’été");
      const stranded = drawer.getByText("1 réservation serait hors de ces heures");
      await stranded.scrollIntoViewIfNeeded();
      await expect(stranded).toBeVisible();
      await expect(drawer.getByText("Semaine habituelle").first()).toBeVisible();

      const wide = await drawer.evaluate((root) =>
        [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
          .filter((n) => n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1)
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
      await mockedPage.goto("availability");
      await mockedPage.getByRole("button", { name: "Change regular week…" }).click();
      await mockedPage.getByLabel("Starting").click();
      await mockedPage.locator(`[role="gridcell"][data-date="${localDay()}"]`).click();
      await mockedPage.getByLabel(/Schedule name/).fill("Summer hours");

      await expect(mockedPage.getByText("Preview unavailable")).toBeVisible();
      await expect(mockedPage.getByText(/You can still save/)).toBeVisible();
      await mockedPage.getByRole("button", { name: /^Save hours from/ }).click();
      await expect.poll(() => state.savedBody()).not.toBeNull();
    });
  });
});

/** Local calendar date of `day` in the current month, as `YYYY-MM-DD`. */
function dayOfThisMonth(day: number): string {
  const d = new Date();
  d.setDate(day);
  return d.toLocaleDateString("en-CA");
}

// #7981: Go to date (toolbar) and Use another day's hours (day drawer), at both widths and locales.
test.describe("navigation and day-drawer controls (#7981)", () => {
  const EN = {
    locale: "en-US",
    more: "More actions",
    goTo: "Go to date",
    go: "Go",
    date: "Date",
    use: "Use another day’s hours…",
    useTitle: "Use another day’s hours",
    from: "Copy hours from",
  };
  const FR = {
    locale: "fr-CA",
    more: "Plus d’actions",
    goTo: "Aller à une date",
    go: "Aller",
    date: "Date",
    use: "Utiliser les heures d’un autre jour…",
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
      await mockedPage.goto("availability");
      // A week on show, so a date a few weeks away is off screen until the jump.
      await mockedPage.getByRole("radio", { name: /^(Week|Semaine)$/ }).click();
      if (c.size.width < 500) {
        await mockedPage.getByRole("button", { name: c.more }).click();
        await mockedPage.getByRole("menuitem", { name: c.goTo }).click();
      } else {
        await mockedPage.getByRole("button", { name: c.goTo }).click();
      }
      const dialog = mockedPage.getByRole("dialog", { name: c.goTo });
      await expect(dialog).toBeVisible();
      // The picker opens on this month; its first or 28th day is more than a week from today.
      const target = new Date().getDate() >= 15 ? dayOfThisMonth(1) : dayOfThisMonth(28);
      await dialog.getByLabel(c.date).click();
      await mockedPage.locator(`[role="gridcell"][data-date="${target}"]`).click();
      await expect(mockedPage.getByRole("dialog", { name: "Popover" })).toBeHidden();
      await dialog.evaluate((el) => el.setAttribute("data-axe-scope", ""));
      const results = await new AxeBuilder({ page: mockedPage })
        .include("[data-axe-scope]")
        .analyze();
      expect(results.violations).toEqual([]);
      await dialog.getByRole("button", { name: c.go, exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(
        mockedPage.locator(`button[data-date="${target}"]:not([role="gridcell"])`)
      ).toBeVisible();
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
      await mockedPage.goto("availability");
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
      await expect(mockedPage.getByRole("dialog", { name: "Popover" })).toBeHidden();
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
