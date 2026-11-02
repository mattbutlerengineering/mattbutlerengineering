import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { loadFixture } from "./api-mocks.js";
import { localDay } from "./local-day.js";

/**
 * F5 (docs/features/venue-availability/ux.md), the PRD demo: a Manager closes a date with
 * 14 bookings, chooses cancel and notify, and sees the calendar band and the outcome counts.
 * The config, days, impact and closure endpoints are stateful: the days answer with the band
 * once the closure POST lands.
 */

const DINNER = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1380 };
const ALL_DAY_CLOSURE = { from: 0, to: 2880 };
const BOOKINGS = 14;
const GUESTS = 52;

/**
 * The browser clock is pinned to today's noon — never a fixed date, because the injected OIDC
 * session's `expires_at` comes from the real clock and a clock pinned past it shows "Your session
 * ended". The closed date is the 15th of next month, so one "Next" page always reaches it, and
 * mid-month keeps it clear of any venue-zone day boundary.
 */
function pinnedNoon(): Date {
  return new Date(`${localDay()}T12:00:00`);
}

function midNextMonth(): string {
  const [year, month] = localDay().split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(year, month, 15)); // `month` is 1-based, so this is next month
  return next.toISOString().slice(0, 10);
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

/**
 * While `dropped`, a closure POST commits and then its response is lost. The API client replays a
 * POST that carries an Idempotency-Key on a network error, so every attempt of one click drops.
 */
interface Connection {
  dropped: boolean;
}

async function mockAvailability(
  page: Page,
  closeDate: string,
  connection: Connection = { dropped: false }
) {
  const venues = JSON.parse(loadFixture("venues-list")) as { data: Array<{ id: string }> };
  const venueId = String(venues.data[0]?.id);
  const base = `**/api/v1/venues/${venueId}`;
  let version = 7;
  let saved: Record<string, unknown> | null = null;
  const posts: Array<{ key: string | undefined; ruleId: string }> = [];
  const json = (data: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data }),
  });

  const config = () => ({
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
      dateRules: saved ? [(saved as { rule: unknown }).rule] : [],
    },
    version,
    source: "rows",
  });

  await page.route(`${base}/availability/config`, (route) => route.fulfill(json(config())));
  await page.route(`${base}/availability/days*`, (route) => {
    const url = new URL(route.request().url());
    const days = datesBetween(url.searchParams.get("from")!, url.searchParams.get("to")!).map(
      (serviceDate) => {
        const closed = saved !== null && serviceDate === closeDate;
        return {
          serviceDate,
          label: closed ? "Closed" : "Regular week",
          scheduleId: closed ? null : "regular",
          serviceCount: closed ? 0 : 1,
          closures: closed ? [{ ruleId: "rule-1", targetKind: "venue", ...ALL_DAY_CLOSURE }] : [],
          bookingOpen: { online: !closed, phone: !closed, waitlist: !closed },
        };
      }
    );
    return route.fulfill(json(days));
  });
  await page.route(`${base}/closures/impact`, (route) => {
    const rule = route.request().postDataJSON().rule as { startsOn: string; targetKind: string };
    const affected = rule.startsOn === closeDate && rule.targetKind === "venue";
    const reservations = Array.from({ length: affected ? BOOKINGS : 0 }, (_, i) => ({
      id: `res-${i}`,
      startTime: `${closeDate}T${String(17 + (i % 5)).padStart(2, "0")}:30:00Z`,
      endTime: `${closeDate}T${String(19 + (i % 3)).padStart(2, "0")}:00:00Z`,
      partySize: i < 10 ? 4 : 3,
      guestName: `Guest ${i + 1}`,
      deposit: i < 3 ? { amountCents: 4000, currency: "USD" } : null,
      runsIntoClosure: false,
    }));
    return route.fulfill(
      json({
        reservations: reservations.length,
        covers: affected ? GUESTS : 0,
        depositsHeld: affected ? 3 : 0,
        groups: affected
          ? [
              {
                groupKey: `${closeDate}:closed`,
                date: closeDate,
                kind: "closed",
                covers: GUESTS,
                depositsHeld: 3,
                reservations,
              },
            ]
          : [],
      })
    );
  });
  await page.route(`${base}/closures`, (route) => {
    // The Special dates tab lists closure outcomes; none exist in this flow.
    if (route.request().method() === "GET") return route.fulfill(json([]));
    const body = route.request().postDataJSON() as { rule: { id: string } };
    posts.push({ key: route.request().headers()["idempotency-key"], ruleId: body.rule.id });
    // A known key answers with the stored result and changes nothing (closure-command.ts replayOf).
    if (saved === null) {
      saved = body as unknown as Record<string, unknown>;
      version += 1;
    }
    if (connection.dropped) return route.abort("connectionreset");
    return route.fulfill(
      json({
        ruleId: "rule-1",
        version,
        changeId: "chg-close-1",
        outcomes: { cancel: BOOKINGS, move: 0, keep_notify: 0, keep_silent: 0 },
      })
    );
  });
  return { saved: () => saved, posts: () => posts, venueId };
}

/** Opens the Close dialog for `closeDate` and advances to step 2 (the 14-booking impact list). */
async function openCloseStepTwo(page: Page, closeDate: string, theme: "light" | "dark" = "light") {
  await page.goto("availability");
  // Desktop renders a grid, phones an agenda; both carry `data-date` on a day's cell or row.
  await expect(page.locator("[data-date]").first()).toBeVisible();
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator(`[data-date="${closeDate}"]`).click();
  // The toolbar has a "Close…" too; the drawer's carries the date.
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Close…", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Close", exact: true });
  await expect(dialog.getByText("Step 1 of 2")).toBeVisible();
  await expect(
    dialog.getByText(new RegExp(`${BOOKINGS} reservations · ${GUESTS} guests`))
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Closed for a private event" }).click();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.getByText("Step 2 of 2")).toBeVisible();
  return { dialog };
}

test.describe("Availability close dialog (F5)", () => {
  // #7994: a long step 2 used to scroll the whole panel, pushing the primary action out of view,
  // and the glass recipe left the panel see-through. Both themes at desktop size, and the phone and
  // reflow sizes in light (the agenda rows carry `data-date` like the grid cells do).
  const cases = [
    { theme: "light", width: 1280, height: 720 },
    { theme: "dark", width: 1280, height: 720 },
    { theme: "light", width: 375, height: 812 },
    { theme: "light", width: 320, height: 568 },
  ] as const;
  for (const { theme, width, height } of cases) {
    test(`step 2 scrolls its body, keeps its primary action in view and the panel opaque (${theme}, ${width}x${height})`, async ({
      mockedPage,
    }) => {
      const CLOSE_DATE = midNextMonth();
      await mockedPage.setViewportSize({ width, height });
      await mockedPage.clock.setFixedTime(pinnedNoon());
      await mockAvailability(mockedPage, CLOSE_DATE);
      const { dialog } = await openCloseStepTwo(mockedPage, CLOSE_DATE, theme);

      await expect(dialog.getByTestId("close-primary")).toBeInViewport({ ratio: 1 });
      // The 14-booking list overflows, so the body (not the panel) scrolls and is a tab stop.
      const body = dialog.getByRole("region", { name: "Scrollable content" });
      expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
      expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
      expect(await dialog.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      // Opaque: the glass recipe's rgb(253 252 250 / 0.85) must not show through.
      // Read alpha from whatever serialization the browser gives; an unknown one fails.
      const alpha = await dialog.evaluate((el) => {
        const color = getComputedStyle(el).backgroundColor;
        const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
        if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
        const comma = /^rgba\(\s*[^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(color);
        if (comma) return Number(comma[1]);
        if (/^rgb\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+\s*\)$/.test(color)) return 1;
        throw new Error(`unrecognised background-color serialization: ${color}`);
      });
      expect(alpha).toBe(1);

      // Past "Show all 14" the list is at its longest. Tabbing to a radio must scroll the body,
      // never the panel: its absolutely positioned inputs used to escape the body's clip and
      // drag the title and the primary action out of the panel.
      await dialog.getByRole("button", { name: /Show all/ }).click();
      for (let i = 0; i < 6; i += 1) {
        await mockedPage.keyboard.press("Tab");
        const onRadio = await mockedPage.evaluate(
          () => document.activeElement?.getAttribute("type") === "radio"
        );
        if (onRadio) break;
      }
      const m = await dialog.evaluate((panel) => {
        const rect = (el: Element) => el.getBoundingClientRect();
        const bodyEl = [...panel.children].find((c) => getComputedStyle(c).overflowY === "auto");
        const active = document.activeElement;
        const label = active?.closest("label") ?? active?.parentElement;
        const p = rect(panel);
        const primary = rect(panel.querySelector("[data-testid=close-primary]")!);
        const title = rect(panel.querySelector("h2")!);
        const b = bodyEl ? rect(bodyEl) : p;
        const l = label ? rect(label) : null;
        return {
          radio: active?.getAttribute("type") === "radio",
          panelScrolls: panel.scrollHeight > panel.clientHeight || panel.scrollTop !== 0,
          titleInPanel: title.top >= p.top,
          primaryInPanel: primary.top >= p.top && primary.bottom <= p.bottom,
          labelInBody: l ? l.top >= b.top - 1 && l.bottom <= b.bottom + 1 : false,
        };
      });
      expect(m).toEqual({
        radio: true,
        panelScrolls: false,
        titleInPanel: true,
        primaryInPanel: true,
        labelInBody: true,
      });
    });
  }

  test("a Manager closes a date, cancels and notifies 14 bookings, and sees the band", async ({
    mockedPage,
  }) => {
    const CLOSE_DATE = midNextMonth();
    await mockedPage.clock.setFixedTime(pinnedNoon());
    const state = await mockAvailability(mockedPage, CLOSE_DATE);
    const { dialog } = await openCloseStepTwo(mockedPage, CLOSE_DATE);
    const calendar = mockedPage.getByRole("grid", { name: "Availability calendar" });

    await expect(dialog.getByText(/3 deposits held/)).toBeVisible();
    // A choice is required for every group before anything is saved.
    const primary = dialog.getByTestId("close-primary");
    await expect(primary).toBeDisabled();
    // The radio's styled circle overlays the native input, so pick it by its label, as a user does.
    const cancelRadio = mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ });
    const cancel = dialog.locator("label").filter({ has: cancelRadio });
    await cancel.click();
    await expect(dialog.getByRole("radio", { name: /Cancel, notify & refund/ })).toBeChecked();
    await expect(primary).toHaveText(`Close and cancel ${BOOKINGS}`);
    await primary.click();

    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await expect(
      notifications.getByText(new RegExp(`${BOOKINGS} reservations notified`))
    ).toBeVisible();
    expect(state.saved()).toMatchObject({
      expectedVersion: 7,
      rule: { kind: "closure", targetKind: "venue", startsOn: CLOSE_DATE, endsOn: CLOSE_DATE },
      decisions: [{ groupKey: `${CLOSE_DATE}:closed`, action: "cancel" }],
    });
    await expect(calendar.locator(`[data-date="${CLOSE_DATE}"]`)).toContainText("Closed all day");
  });

  test("closing the same date again warns, naming the closure, without blocking it (#8006)", async ({
    mockedPage,
  }) => {
    const CLOSE_DATE = midNextMonth();
    await mockedPage.clock.setFixedTime(pinnedNoon());
    await mockAvailability(mockedPage, CLOSE_DATE);
    const { dialog } = await openCloseStepTwo(mockedPage, CLOSE_DATE);
    const cancelRadio = mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ });
    await dialog.locator("label").filter({ has: cancelRadio }).click();
    await dialog.getByTestId("close-primary").click();
    await expect(dialog).toBeHidden();

    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await expect(notifications.getByText(/reservations notified/)).toBeVisible();
    await mockedPage.locator(`[data-date="${CLOSE_DATE}"]`).click();
    await mockedPage
      .getByRole("dialog")
      .getByRole("button", { name: "Close…", exact: true })
      .click();

    const again = mockedPage.getByRole("dialog", { name: "Close", exact: true });
    await expect(again.getByRole("alert")).toContainText(/Already closed on .*: Whole venue\./);
    await expect(again.getByTestId("close-primary")).toBeEnabled();
  });

  test("a close whose response was lost reports success when retried, under the same key", async ({
    mockedPage,
  }) => {
    const CLOSE_DATE = midNextMonth();
    await mockedPage.clock.setFixedTime(pinnedNoon());
    const connection: Connection = { dropped: true };
    const state = await mockAvailability(mockedPage, CLOSE_DATE, connection);
    await mockedPage.goto("availability");

    const calendar = mockedPage.getByRole("grid", { name: "Availability calendar" });
    await expect(calendar).toBeVisible();
    await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
    await calendar.locator(`[data-date="${CLOSE_DATE}"]`).click();
    const drawer = mockedPage.getByRole("dialog");
    await drawer.getByRole("button", { name: "Close…", exact: true }).click();

    const dialog = mockedPage.getByRole("dialog", { name: "Close", exact: true });
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
    const cancelRadio = mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ });
    await dialog.locator("label").filter({ has: cancelRadio }).click();
    const primary = dialog.getByTestId("close-primary");
    await primary.click();

    // The cancellations committed, but the Manager only sees the dropped connection. One click
    // makes up to four attempts (1 s, 2 s and 4 s backoff plus jitter), so the failure shows
    // after 5.6 to 8.4 s: wait past that, not for the default 5 s.
    await expect(dialog.getByText("Couldn't close")).toBeVisible({ timeout: 15_000 });
    connection.dropped = false;
    await primary.click();

    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await expect(
      notifications.getByText(new RegExp(`${BOOKINGS} reservations notified`))
    ).toBeVisible();
    const attempts = state.posts();
    const [first, last] = [attempts[0], attempts.at(-1)];
    expect(attempts.length).toBeGreaterThan(1);
    expect(last?.key).toBeTruthy();
    expect(new Set(attempts.map((a) => a.key)).size).toBe(1);
    expect(last?.ruleId).toBe(first?.ruleId);
  });
});
