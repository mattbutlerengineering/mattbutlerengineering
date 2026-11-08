import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { localDay } from "./local-day.js";

/**
 * ADR-032, PRD criterion 4: a Manager closes one named section for a date from the Close dialog.
 * The saved rule names the section and carries its tables; the calendar then names the section
 * ("Bar closed all day") instead of listing tables. Config, days, impact, closure, sections and
 * tables are stateful stubs: the days answer with the band once the closure POST lands.
 */

const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };
const ALL_DAY = { from: 0, to: 2880 };
const SECTIONS = [
  { id: "sec-bar", name: "Bar" },
  { id: "sec-main", name: "Main Dining" },
];
const TABLE_SECTIONS: Record<string, string> = {
  tbl_e2e_001: "sec-bar",
  tbl_e2e_002: "sec-bar",
  tbl_e2e_003: "sec-main",
};

/** Today's noon, never a fixed date: the injected session's expiry comes from the real clock. */
const pinnedNoon = () => new Date(`${localDay()}T12:00:00`);

function midNextMonth(): string {
  const [year, month] = localDay().split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 15)).toISOString().slice(0, 10);
}

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

async function mockAvailability(page: Page, closeDate: string) {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  let version = 7;
  let saved: { rule: Record<string, unknown> } | null = null;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });

  await page.route(`${base}/availability/config`, (route) =>
    route.fulfill(
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
          assignments: [
            { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
          ],
          dateRules: saved ? [saved.rule] : [],
        },
        version,
        source: "rows",
      })
    )
  );
  await page.route(`${base}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const days = datesBetween(url.searchParams.get("from")!, url.searchParams.get("to")!).map(
      (serviceDate) => {
        const closed = saved !== null && serviceDate === closeDate;
        return {
          serviceDate,
          label: closed ? "Tables blocked" : "Regular week",
          scheduleId: "regular",
          serviceCount: 1,
          closures: closed
            ? [
                {
                  ruleId: "rule-1",
                  targetKind: "tables",
                  sectionId: "sec-bar",
                  ...ALL_DAY,
                },
              ]
            : [],
          bookingOpen: { online: true, phone: true, waitlist: true },
        };
      }
    );
    return route.fulfill(json(days));
  });
  await page.route(`${base}/closures/impact`, (route) =>
    route.fulfill(json({ reservations: 0, covers: 0, depositsHeld: 0, groups: [] }))
  );
  await page.route(`${base}/closures`, (route) => {
    if (route.request().method() === "GET") return route.fulfill(json([]));
    saved = route.request().postDataJSON() as { rule: Record<string, unknown> };
    version += 1;
    return route.fulfill(
      json({
        ruleId: "rule-1",
        version,
        changeId: "chg-close-1",
        outcomes: { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 },
      })
    );
  });

  // The venue's sections, and tables placed in them (the shared mock answers with none).
  await page.route(/\/api\/v1\/floor-plan-sections(\?|$)/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const now = new Date().toISOString();
    return route.fulfill(
      json(
        SECTIONS.map((s, i) => ({
          ...s,
          venueId: "ven_e2e_001",
          floorPlanId: "fp_e2e_001",
          color: "#8b7355",
          displayOrder: i,
          createdAt: now,
          updatedAt: now,
        }))
      )
    );
  });
  await page.route("**/api/v1/tables?*", (route) => {
    const tables = JSON.parse(loadFixture("tables-list")) as {
      data: Array<Record<string, unknown>>;
      pagination: Record<string, unknown>;
    };
    const data = tables.data.map((t) => ({
      ...t,
      sectionId: TABLE_SECTIONS[String(t.id)] ?? null,
    }));
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...tables,
        data,
        pagination: { ...tables.pagination, total: data.length },
      }),
    });
  });
  return { saved: () => saved };
}

test.describe("Availability close dialog: One section (ADR-032)", () => {
  test("a Manager closes the Bar for a date, and the calendar names it", async ({ mockedPage }) => {
    const CLOSE_DATE = midNextMonth();
    await mockedPage.clock.setFixedTime(pinnedNoon());
    const state = await mockAvailability(mockedPage, CLOSE_DATE);

    await mockedPage.goto("availability?tab=calendar");
    const calendar = mockedPage.getByRole("grid", { name: "Availability calendar" });
    await expect(calendar).toBeVisible();
    await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
    await calendar.locator(`[data-date="${CLOSE_DATE}"]`).click();
    await mockedPage
      .getByRole("dialog")
      .getByRole("button", { name: "Close…", exact: true })
      .click();

    const dialog = mockedPage.getByRole("dialog", { name: "Close", exact: true });
    // The radio's styled circle overlays the native input, so pick it by its label, as a user does.
    await dialog.getByText("One section", { exact: true }).click();
    await dialog.getByRole("combobox", { name: "Section" }).click();
    await mockedPage.getByRole("option", { name: "Bar", exact: true }).click();
    await dialog.getByRole("button", { name: /^Close Bar on / }).click();

    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await expect(notifications.getByText(/^Bar closed on /)).toBeVisible();
    expect(state.saved()).toMatchObject({
      expectedVersion: 7,
      rule: {
        kind: "closure",
        targetKind: "tables",
        sectionId: "sec-bar",
        tableIds: ["tbl_e2e_001", "tbl_e2e_002"],
        startsOn: CLOSE_DATE,
        endsOn: CLOSE_DATE,
      },
    });
    // The cell is quiet: one chip ("Bar closed"); its accessible name keeps the full description.
    const cell = calendar.locator(`[data-date="${CLOSE_DATE}"]`);
    await expect(cell).toContainText("Bar closed");
    await expect(cell).toHaveAttribute("aria-label", /Bar closed all day/);
  });

  test("?closeSection= opens the Close dialog on that section, and leaves no param behind", async ({
    mockedPage,
  }) => {
    await mockedPage.clock.setFixedTime(pinnedNoon());
    await mockAvailability(mockedPage, midNextMonth());

    await mockedPage.goto("availability?closeSection=sec-main");

    const dialog = mockedPage.getByRole("dialog", { name: "Close", exact: true });
    await expect(dialog.getByRole("radio", { name: "One section" })).toBeChecked();
    await expect(dialog.getByRole("combobox", { name: "Section" })).toContainText("Main Dining");
    await expect(mockedPage).not.toHaveURL(/closeSection/);
  });
});
