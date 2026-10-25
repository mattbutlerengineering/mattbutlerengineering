import type { Locator, Page } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";
import { test, expect } from "./fixtures.js";
import { pickBookingDate } from "./booking-date.js";

// Special Requests said back (remembered-on-arrival SC1, SC3, SC9). Guest pages run at a
// 375 px phone; the host ticket runs on the desktop sidebar and the tablet sheet.

const VENUE_SLUG = "e2e-test-bistro";
const VENUE_NAME = "E2E Test Bistro";
const MANAGE_TOKEN = "e2e-special-requests-token";
interface SpecialRequestsCopy {
  label: string;
  acknowledgement: string;
  hostCaption: string;
}

/** A locale's catalog is the only source of its copy (SC4). */
function specialRequestsCopy(locale: string): SpecialRequestsCopy {
  const url = new URL(`../src/i18n/catalogs/${locale}.json`, import.meta.url);
  return (
    JSON.parse(readFileSync(url, "utf8")) as {
      bookingWidget: { specialRequests: SpecialRequestsCopy };
    }
  ).bookingWidget.specialRequests;
}

/** The caption nests the acknowledgement by key; compose it rather than retype the sentence. */
function hostCaptionOf(copy: SpecialRequestsCopy): string {
  return copy.hostCaption.replace(
    "$t(bookingWidget.specialRequests.acknowledgement)",
    copy.acknowledgement
  );
}

/** These specs run in en-US unless a test stores another staff locale. */
const SPECIAL_REQUESTS = specialRequestsCopy("en-US");
const LABEL = SPECIAL_REQUESTS.label;
const ACKNOWLEDGEMENT = SPECIAL_REQUESTS.acknowledgement;
const HOST_CAPTION = hostCaptionOf(SPECIAL_REQUESTS);
/** Mirrors LOCALE_STORAGE_KEY in src/i18n/runtime.tsx: the staff (dashboard) locale. */
const STAFF_LOCALE_KEY = "mbe-hospitality-locale";

/** The guest pressed return once; the second line must start on its own line box. */
const TWO_LINE_NOTE = "Our anniversary.\nWindow seat if you can, and she can't have tree nuts.";

/** 2,000 characters with one guest line break and a 300-character unbroken run. */
const LONG_NOTE = (() => {
  const head = `Anniversary dinner.\n${"W".repeat(300)} `;
  const filler = "Quiet corner please, and a candle on the table if you have one. ";
  return (head + filler.repeat(40)).slice(0, 2000).replace(/\s$/, ".");
})();

const baseReservation = JSON.parse(
  readFileSync(join(import.meta.dirname, "fixtures", "reservations-list.json"), "utf-8")
).data[0] as Record<string, unknown>;

function jsonOk(data: unknown): string {
  return JSON.stringify({ data });
}

/** Spec-local overrides, registered after mockApi (booking-widget-calendar.spec.ts precedent). */
async function mockGuestPages(page: Page, notes: string): Promise<void> {
  await page.route("**/public/v1/venues/*/guests/recognize*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonOk({ recognized: false, firstName: null, visitCount: 0, hasPreferences: false }),
    })
  );
  // The shared hold mock expires in the past, which resets the flow after confirmation.
  await page.route("**/public/v1/venues/*/holds", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonOk({
        id: "hold_e2e_requests_001",
        venueId: "ven_e2e_001",
        tableId: "tbl_e2e_001",
        date: "2026-05-17",
        startTime: "2026-05-17T18:00:00.000Z",
        endTime: "2026-05-17T19:30:00.000Z",
        partySize: 2,
        sessionId: "sess_e2e_requests_001",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    })
  );
  // Echo the notes the widget actually POSTed, so the form -> confirm -> view round trip is
  // proven: if the widget stopped sending notes, the confirmation would show no group.
  await page.route("**/public/v1/venues/*/holds/*/confirm", (route) => {
    const posted = route.request().postDataJSON() as { notes?: string } | null;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonOk({ ...baseReservation, notes: posted?.notes ?? null }),
    });
  });
  await page.route("**/public/v1/reservations/manage*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonOk({
        reservation: {
          id: baseReservation.id,
          date: baseReservation.date,
          startTime: baseReservation.startTime,
          endTime: baseReservation.endTime,
          partySize: baseReservation.partySize,
          guestName: baseReservation.guestName,
          guestEmail: "requests-e2e@example.com",
          status: "CONFIRMED",
          notes,
        },
        venue: {
          id: "ven_e2e_001",
          name: VENUE_NAME,
          slug: VENUE_SLUG,
          ianaTimezone: "America/New_York",
        },
      }),
    })
  );
}

async function bookThroughTheWidget(page: Page, notes: string): Promise<void> {
  await page.goto(`book/${VENUE_SLUG}`);
  await expect(page.getByRole("heading", { name: VENUE_NAME })).toBeVisible();
  const bookingDate = new Date();
  bookingDate.setDate(bookingDate.getDate() + 3);
  await pickBookingDate(page, bookingDate.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Find Available Times" }).click();
  await page.getByRole("option").first().click();
  await page.getByLabel("Name").fill("Requests E2E Guest");
  await page.getByLabel("Email").fill("requests-e2e@example.com");
  await page.getByLabel(LABEL).fill(notes);
  await page.getByRole("button", { name: "Complete Reservation" }).click();
  await expect(page.getByText("Reservation Confirmed!")).toBeVisible();
}

/**
 * SC9 at 375 px: the page does not scroll sideways, and every line box of the words stays inside
 * the group. The second check is the one that sees a missing `overflow-wrap`: an ancestor clips
 * overflow here, so the document's scrollWidth alone stays green even when a run spills out.
 */
async function expectNoSidewaysScroll(page: Page, group: Locator): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.innerWidth);

  const bounds = await group.evaluate((el) => {
    const words = el.querySelector('[dir="auto"]');
    const range = document.createRange();
    range.selectNodeContents(words as Node);
    const rights = [...range.getClientRects()].map((r) => r.right);
    return { groupRight: el.getBoundingClientRect().right, wordsRight: Math.max(...rights) };
  });
  expect(bounds.groupRight).toBeLessThanOrEqual(widths.innerWidth);
  expect(bounds.wordsRight).toBeLessThanOrEqual(bounds.groupRight + 1);
}

/**
 * Measures the words' one text node: at least two line boxes, and the text after the guest's
 * `\n` starts on a lower line box than the text before it, so the break is the guest's and
 * not wrapping.
 */
async function expectGuestLineBreak(group: Locator): Promise<void> {
  const words = group.locator('[dir="auto"]');
  const lines = await words.evaluate((el) => {
    const node = el.firstChild as Text;
    const text = node.data;
    const breakAt = text.indexOf("\n");
    const rectsOf = (start: number, end: number) => {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      return [...range.getClientRects()];
    };
    return {
      childNodes: el.childNodes.length,
      distinctTops: new Set(rectsOf(0, text.length).map((r) => Math.round(r.top))).size,
      beforeLastTop: Math.max(...rectsOf(0, breakAt).map((r) => r.top)),
      afterFirstTop: Math.min(...rectsOf(breakAt + 1, text.length).map((r) => r.top)),
    };
  });
  expect(lines.childNodes).toBe(1);
  expect(lines.distinctTops).toBeGreaterThanOrEqual(2);
  expect(lines.afterFirstTop).toBeGreaterThan(lines.beforeLastTop);
}

test.describe("Guest pages say the Special Requests back (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("confirmation: a 2,000-character request with a 300-character run causes no sideways scroll", async ({
    mockedPage,
  }) => {
    await mockGuestPages(mockedPage, LONG_NOTE);
    await bookThroughTheWidget(mockedPage, LONG_NOTE);
    const group = mockedPage.getByRole("group", { name: LABEL });
    await expect(group).toBeVisible();
    await expect(group.getByText(ACKNOWLEDGEMENT)).toBeVisible();
    await expectNoSidewaysScroll(mockedPage, group);
  });

  test("confirmation: the guest's line break is a real line break", async ({ mockedPage }) => {
    await mockGuestPages(mockedPage, TWO_LINE_NOTE);
    await bookThroughTheWidget(mockedPage, TWO_LINE_NOTE);
    const group = mockedPage.getByRole("group", { name: LABEL });
    await expect(group).toBeVisible();
    await expectGuestLineBreak(group);
  });

  test("manage page: a 2,000-character request with a 300-character run causes no sideways scroll", async ({
    mockedPage,
  }) => {
    await mockGuestPages(mockedPage, LONG_NOTE);
    await mockedPage.goto(`reservations/manage?token=${MANAGE_TOKEN}`);
    const group = mockedPage.getByRole("group", { name: LABEL });
    await expect(group).toBeVisible();
    await expect(group.getByText(ACKNOWLEDGEMENT)).toBeVisible();
    await expectNoSidewaysScroll(mockedPage, group);
  });

  test("manage page: the guest's line break is a real line break", async ({ mockedPage }) => {
    await mockGuestPages(mockedPage, TWO_LINE_NOTE);
    await mockedPage.goto(`reservations/manage?token=${MANAGE_TOKEN}`);
    const group = mockedPage.getByRole("group", { name: LABEL });
    await expect(group).toBeVisible();
    await expectGuestLineBreak(group);
  });
});

test.describe("The host ticket carries the same words", () => {
  // Bob Smith (res_e2e_002) is the fixture party with notes: "Birthday celebration".
  const BOB = "res_e2e_002";

  test("desktop sidebar: Special Requests with the host caption and the guest's words", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("timeline");
    await mockedPage.getByTestId(`reservation-block-${BOB}`).click();
    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    const group = sidebar.getByRole("group", { name: LABEL });
    await expect(group).toBeVisible();
    await expect(group.getByText(HOST_CAPTION)).toBeVisible();
    await expect(group.getByText("Birthday celebration")).toBeVisible();
  });

  for (const locale of ["es-MX", "fr-CA"] as const) {
    test(`desktop sidebar in ${locale}: label and caption follow the staff locale`, async ({
      mockedPage,
    }) => {
      const copy = specialRequestsCopy(locale);
      await mockedPage.addInitScript(([key, tag]) => localStorage.setItem(key, tag), [
        STAFF_LOCALE_KEY,
        locale,
      ] as const);
      await mockedPage.goto("timeline");
      await expect(mockedPage.locator("html")).toHaveAttribute("lang", locale);
      await mockedPage.getByTestId(`reservation-block-${BOB}`).click();
      const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
      const group = sidebar.getByRole("group", { name: copy.label });
      await expect(group).toBeVisible();
      await expect(group.getByText(hostCaptionOf(copy))).toBeVisible();
      await expect(group.getByText("Birthday celebration")).toBeVisible();
    });
  }

  test("tablet sheet at 1024×768: the request is in view without pressing More", async ({
    mockedPage,
  }) => {
    await mockedPage.setViewportSize({ width: 1024, height: 768 });
    await mockedPage.goto("timeline");
    await mockedPage.getByTestId(`reservation-block-${BOB}`).click();
    const sheet = mockedPage.getByRole("dialog", { name: "Bob Smith" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: /^More/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    const group = sheet.getByRole("group", { name: LABEL });
    await expect(group).toBeInViewport();
    await expect(group.getByText("Birthday celebration")).toBeInViewport();
  });
});
