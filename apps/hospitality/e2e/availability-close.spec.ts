import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { mockClosures } from "./helpers/close-mock.js";
import type { CloseConnection } from "./helpers/close-mock.js";
import { localDay } from "./local-day.js";

/**
 * F5 (docs/features/venue-availability/ux.md), the PRD demo: a Manager closes a date with
 * 14 bookings, chooses cancel and notify, and sees the calendar band and the outcome counts.
 * The config, days, impact and closure endpoints are stateful: the days answer with the band
 * once the closure POST lands.
 */

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

/** Opens the Close dialog for `closeDate` and advances to step 2 (the 14-booking impact list). */
async function openCloseStepTwo(page: Page, closeDate: string, theme: "light" | "dark" = "light") {
  await page.goto("availability?tab=calendar");
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
      await mockClosures(mockedPage, { closeDate: CLOSE_DATE, bookings: BOOKINGS });
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
    const state = await mockClosures(mockedPage, { closeDate: CLOSE_DATE, bookings: BOOKINGS });
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
    // The cell is quiet: a "Closed" chip (+1 for the paused booking); the accessible name keeps
    // the full description.
    const cell = calendar.locator(`[data-date="${CLOSE_DATE}"]`);
    await expect(cell).toContainText("Closed");
    await expect(cell).toHaveAttribute("aria-label", /closed all day/);
  });

  test("Preview message shows the notice the server renders for the chosen outcome (#7983)", async ({
    mockedPage,
  }) => {
    const CLOSE_DATE = midNextMonth();
    await mockedPage.clock.setFixedTime(pinnedNoon());
    const state = await mockClosures(mockedPage, { closeDate: CLOSE_DATE, bookings: BOOKINGS });
    const { dialog } = await openCloseStepTwo(mockedPage, CLOSE_DATE);
    const cancelRadio = mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ });
    await dialog.locator("label").filter({ has: cancelRadio }).click();
    await expect(state.notices()).toHaveLength(0);

    await dialog.getByRole("button", { name: "Preview message" }).click();

    const region = dialog.getByRole("region", { name: "Preview message" });
    await expect(region).toContainText("Your reservation at Rivera Bistro is cancelled");
    await expect(region).toContainText("Closed for a private event");
    await expect(region).toContainText("Rebook: https://example.com/m");
    await expect(region).toContainText("From: Matt Butler Engineering <reservations@example.com>");
    await expect(region).toContainText(/Example: Guest 1 at /);
    await expect(region).toContainText("Each message is in the language that guest booked in.");
    expect(state.notices()).toEqual([
      expect.objectContaining({ action: "cancel", message: "Closed for a private event" }),
    ]);
    // Nothing in the preview clips or pushes the primary action out of the panel.
    await expect(dialog.getByTestId("close-primary")).toBeInViewport({ ratio: 1 });
  });

  test("closing the same date again warns, naming the closure, without blocking it (#8006)", async ({
    mockedPage,
  }) => {
    const CLOSE_DATE = midNextMonth();
    await mockedPage.clock.setFixedTime(pinnedNoon());
    await mockClosures(mockedPage, { closeDate: CLOSE_DATE, bookings: BOOKINGS });
    const { dialog } = await openCloseStepTwo(mockedPage, CLOSE_DATE);
    const cancelRadio = mockedPage.getByRole("radio", { name: /Cancel, notify & refund/ });
    await dialog.locator("label").filter({ has: cancelRadio }).click();
    await dialog.getByTestId("close-primary").click();
    await expect(dialog).toBeHidden();

    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await expect(notifications.getByText(/reservations notified/)).toBeVisible();
    // Its drawer offers no Close… on a day already closed; the toolbar's reaches it by date.
    await mockedPage.locator(`[data-date="${CLOSE_DATE}"]`).click();
    const drawer = mockedPage.getByRole("dialog");
    await expect(drawer.getByText("Why this day")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Close…", exact: true })).toHaveCount(0);
    await mockedPage.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await mockedPage.getByRole("button", { name: /^Close…/ }).click();
    const again = mockedPage.getByRole("dialog", { name: "Close", exact: true });
    await again.getByText("One date", { exact: true }).click();
    await again.getByRole("combobox", { name: "Date" }).click();
    await mockedPage.getByRole("button", { name: "Next month" }).click();
    // The picker's grid is named for its month; the page's is "Availability calendar".
    await mockedPage
      .getByRole("grid", { name: /^\p{L}+ \d{4}$/u })
      .locator(`[data-date="${CLOSE_DATE}"]`)
      .click();

    await expect(again.getByRole("alert")).toContainText(/Already closed on .*: Whole venue\./);
    await expect(again.getByTestId("close-primary")).toBeEnabled();
  });

  test("a close whose response was lost reports success when retried, under the same key", async ({
    mockedPage,
  }) => {
    const CLOSE_DATE = midNextMonth();
    await mockedPage.clock.setFixedTime(pinnedNoon());
    const connection: CloseConnection = { dropped: true };
    const state = await mockClosures(mockedPage, {
      closeDate: CLOSE_DATE,
      bookings: BOOKINGS,
      connection,
    });
    await mockedPage.goto("availability?tab=calendar");

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
