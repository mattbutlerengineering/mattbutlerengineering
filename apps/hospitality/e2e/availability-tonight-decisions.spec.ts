import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";

/**
 * #7978. A Manager closes tonight early with bookings after the new close (ux.md F7.3): the
 * server refuses until each group has a decision, then refuses once more because the group
 * changed while the Manager was deciding. The dialog must say so, void the old choice and show
 * the new bookings; the save that follows reports its outcome in a toast that offers the call
 * list, whose rows carry their dates.
 */

const VENUE_ZONE = "America/New_York";
const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };

test.use({ timezoneId: VENUE_ZONE });

/** Today on the venue clock, and an instant on it, so the page and the mocks agree on "tonight". */
function venueToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: VENUE_ZONE });
}

interface TonightMocks {
  readonly posts: () => ReadonlyArray<Record<string, unknown>>;
}

async function mockTonight(page: Page, today: string): Promise<TonightMocks> {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });
  const refusal = (code: string) => ({
    status: 422,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: "about:blank",
      title: code,
      status: 422,
      detail: "Every affected group needs a choice.",
      code,
      groupKeys: [`${today}:shortened`],
    }),
  });
  const posts: Array<Record<string, unknown>> = [];
  let impacts = 0;

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
          dateRules: [],
        },
        version: 7,
        source: "rows",
      })
    )
  );
  // The second ask is the group after it changed: a fourth booking has joined it.
  await page.route(`${base}/closures/impact`, (route) => {
    impacts += 1;
    const ids = impacts === 1 ? ["res-1", "res-2", "res-3"] : ["res-1", "res-2", "res-3", "res-4"];
    return route.fulfill(
      json({
        reservations: ids.length,
        covers: ids.length * 2,
        depositsHeld: 0,
        groups: [
          {
            groupKey: `${today}:shortened`,
            date: today,
            kind: "shortened",
            covers: ids.length * 2,
            depositsHeld: 0,
            reservations: ids.map((id, i) => ({
              id,
              startTime: `${today}T23:${String(10 + i * 5).padStart(2, "0")}:00Z`,
              endTime: `${today}T23:50:00Z`,
              partySize: 2,
              guestName: `Guest ${i + 1}`,
              deposit: null,
              runsIntoClosure: true,
            })),
          },
        ],
      })
    );
  });
  await page.route(`${base}/tonight`, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    const decisions = body["decisions"] as unknown[] | undefined;
    // First: nothing decided yet. Second: decided on a group that has since changed.
    if (posts.length <= 2) return route.fulfill(refusal("decision-required"));
    return route.fulfill(
      json({
        ruleId: body["ruleId"],
        version: 8,
        changeId: "chg-tonight",
        outcomes: { cancel: decisions?.length ? 4 : 0, move: 0, keep_notify: 0, keep_silent: 0 },
        serviceDate: today,
        expiresAt: `${today}T23:59:00Z`,
      })
    );
  });
  await page.route(`${base}/closures/*/call-list`, (route) =>
    route.fulfill(
      json([
        {
          outcomeId: "o-1",
          reservationId: "res-1",
          guestName: "Rivera",
          partySize: 2,
          startTime: `${today}T23:10:00Z`,
          guestPhone: "+15555550100",
        },
      ])
    )
  );
  return { posts: () => posts };
}

const sizes = [
  { width: 1280, height: 720 },
  { width: 375, height: 812 },
] as const;

for (const { width, height } of sizes) {
  test(`Tonight decisions recover from a changed group, report the outcome and offer the call list (${width}x${height})`, async ({
    mockedPage,
  }) => {
    const today = venueToday();
    await mockedPage.setViewportSize({ width, height });
    await mockedPage.clock.setFixedTime(new Date(`${today}T19:30:00-04:00`));
    const mocks = await mockTonight(mockedPage, today);
    await mockedPage.goto("timeline");

    await mockedPage.getByRole("button", { name: /^Tonight(?!'s)/ }).click();
    await mockedPage.getByRole("button", { name: "Apply", exact: true }).first().click();

    const dialog = mockedPage.getByRole("dialog", { name: "Bookings after the new close" });
    await expect(dialog.getByText(/Guest 1/)).toBeVisible();
    const cancel = dialog
      .locator("label")
      .filter({ has: mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ }) });
    await cancel.click();
    await dialog.getByRole("button", { name: "Close and cancel 3" }).click();

    // The group changed while the Manager was deciding: say so, void the choice, show the new one.
    await expect(dialog.getByText(/bookings changed while you were deciding/i)).toBeVisible();
    await expect(dialog.getByText(/Guest 4/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Choose for each group" })).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Choose for each group" })
    ).toHaveAccessibleDescription(/each group/i);

    await cancel.click();
    await dialog.getByRole("button", { name: "Close and cancel 4" }).click();

    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await expect(
      notifications.getByText(/Closing early at .* · 4 reservations notified/)
    ).toBeVisible();
    expect(mocks.posts()).toHaveLength(3);
    expect(
      (mocks.posts()[2] as { decisions: Array<{ reservationIds: string[] }> }).decisions[0]
        ?.reservationIds
    ).toEqual(["res-1", "res-2", "res-3", "res-4"]);

    // A real click on the toast's action: Playwright fails if anything covers it.
    await notifications.getByRole("button", { name: "Call list" }).click();
    const callList = mockedPage.getByRole("dialog", { name: "Call list" });
    // Five columns cannot fit a phone: there the headers go and each guest stacks (#7980).
    if (width >= 768) {
      await expect(callList.getByRole("columnheader", { name: "Date" })).toBeVisible();
    }
    await expect(callList.getByText("Rivera")).toBeVisible();
  });
}

test("Tonight decisions: a changed choice after a lost response shows what really applied", async ({
  mockedPage,
}) => {
  const today = venueToday();
  await mockedPage.clock.setFixedTime(new Date(`${today}T19:30:00-04:00`));
  await mockTonight(mockedPage, today);
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const base = `**/api/v1/venues/${String(venues.data[0]?.id)}`;

  // The first save with decisions commits and its response is lost; the config then shows it.
  let committed: string | null = null;
  let sends = 0;
  await mockedPage.route(`${base}/availability/config`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
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
            dateRules: committed
              ? [
                  {
                    id: committed,
                    kind: "tonight",
                    targetKind: "venue",
                    startsOn: today,
                    endsOn: today,
                    expiresAt: `${today}T23:59:00Z`,
                    payload: { version: 1, closeAt: 1320 },
                  },
                ]
              : [],
          },
          version: committed ? 8 : 7,
          source: "rows",
        },
      }),
    })
  );
  await mockedPage.route(`${base}/tonight`, (route) => {
    const body = route.request().postDataJSON() as { ruleId: string; decisions?: unknown[] };
    sends += 1;
    if (!body.decisions) {
      return route.fulfill({
        status: 422,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "about:blank",
          title: "decision-required",
          status: 422,
          detail: "Every affected group needs a choice.",
          code: "decision-required",
          groupKeys: [`${today}:shortened`],
        }),
      });
    }
    if (committed === null || committed === body.ruleId) {
      committed = body.ruleId;
      return route.abort("connectionreset");
    }
    return route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Availability changed since you loaded it.",
        code: "version-conflict",
      }),
    });
  });
  await mockedPage.goto("timeline");

  await mockedPage.getByRole("button", { name: /^Tonight(?!'s)/ }).click();
  await mockedPage.getByRole("button", { name: "Apply", exact: true }).first().click();
  const dialog = mockedPage.getByRole("dialog", { name: "Bookings after the new close" });
  await expect(dialog.getByText(/Guest 1/)).toBeVisible();

  await dialog
    .locator("label")
    .filter({ has: mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ }) })
    .click();
  await dialog.getByRole("button", { name: "Close and cancel 3" }).click();
  await expect(dialog.getByText(/may have gone through/)).toBeVisible({ timeout: 40_000 });

  await dialog
    .locator("label")
    .filter({ has: mockedPage.getByRole("radio", { name: "Keep them and notify" }) })
    .click();
  await dialog.getByRole("button", { name: "Close and keep 3" }).click();

  await expect(dialog.getByText(/An earlier try was saved: cancel 3/)).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await expect(
    mockedPage.getByRole("region", { name: "Notifications" }).getByText(/notified/)
  ).toHaveCount(0);
  expect(sends).toBeGreaterThanOrEqual(3);

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});
