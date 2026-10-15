/**
 * Per-locale sweep of the guest-facing public routes
 * (docs/features/localization/architecture.md § "Per-locale e2e sweep").
 *
 * For each of en-GB, es-MX and fr-CA the guest locale is stored before load,
 * then every step of `book/:venueSlug` and `reservations/manage` is walked and
 * swept for two defects the type system and the lint rule cannot see:
 *
 *  1. UNTRANSLATED TEXT — visible text (text nodes, placeholders, aria-labels,
 *     titles) equal to an en-US catalog value that the locale translates
 *     differently. The forbidden set is built from the committed catalogs
 *     (app catalog plus Rialto's built-in messages) — data, not a hand list —
 *     so a new key is covered the moment it exists. English that the lint rule
 *     misses (a label in a plain object, a component that bypasses `t()`)
 *     lands here.
 *  2. A catalog value reverted to English. That value no longer "differs", so
 *     the rule above alone cannot see it; in the public namespaces a value
 *     identical to en-US must therefore be an acknowledged cognate
 *     (SAME_AS_EN_US) or its visible text fails too.
 *  3. OVERFLOW — any element whose content is wider than its box, unless it
 *     sits inside a `data-truncate` ellipsis cell (the sanctioned exception,
 *     ux.md), and any page-level sideways scroll. Swept at a phone width, where
 *     the longer es-MX / fr-CA strings bite first.
 *
 * Runs through the bare `test:e2e` script like the other public-route specs
 * (playwright.config.ts auto-discovers e2e/*.spec.ts; workflow-coverage.test.ts
 * pins both that and this file's presence). Every endpoint a step acts on is
 * mocked below, and `unmocked` fails the test on any request no mock answered.
 */
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { enUS as rialtoEnUS, type RialtoMessages } from "@mattbutlerengineering/rialto/providers";
import { enGB as rialtoEnGB } from "@mattbutlerengineering/rialto/locales/en-GB";
import { esMX as rialtoEsMX } from "@mattbutlerengineering/rialto/locales/es-MX";
import { frCA as rialtoFrCA } from "@mattbutlerengineering/rialto/locales/fr-CA";
import { test, expect } from "./fixtures.js";

const VENUE_SLUG = "e2e-test-bistro";
const VENUE_NAME = "E2E Test Bistro";
const MANAGE_TOKEN = "locale-sweep-token";
/** Mirrors WIDGET_LOCALE_STORAGE_KEY — the guest's own key, never the dashboard's. */
const STORAGE_KEY = "mbe-booking-widget-locale";
const PHONE = { width: 375, height: 812 } as const;

type Locale = "en-GB" | "es-MX" | "fr-CA";
const LOCALES: readonly Locale[] = ["en-GB", "es-MX", "fr-CA"];

type Flat = Record<string, string>;

function flatten(node: unknown, prefix = ""): Flat {
  if (typeof node === "string") return { [prefix]: node };
  if (node === null || typeof node !== "object") return {};
  return Object.entries(node).reduce<Flat>(
    (acc, [key, value]) => ({ ...acc, ...flatten(value, prefix ? `${prefix}.${key}` : key) }),
    {}
  );
}

const loadCatalog = (tag: string): Flat =>
  flatten(
    JSON.parse(readFileSync(new URL(`../src/i18n/catalogs/${tag}.json`, import.meta.url), "utf8"))
  );

/** Rialto's messages are plain strings and functions; only the strings are statically comparable. */
const rialtoStrings = (messages: RialtoMessages): Flat =>
  Object.fromEntries(
    Object.entries(messages)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => [`rialto.${key}`, value])
  );

const RIALTO: Record<Locale, RialtoMessages> = {
  "en-GB": rialtoEnGB,
  "es-MX": rialtoEsMX,
  "fr-CA": rialtoFrCA,
};

/** The namespaces these routes render; a value left identical to en-US here must be acknowledged. */
const PUBLIC_NAMESPACE = /^(publicBooking|bookingWidget|manageReservation)\./;

/**
 * Keys whose target-locale value legitimately equals en-US (product names and
 * cognates). Anything else in PUBLIC_NAMESPACE that still reads as English is
 * an untranslated entry.
 */
const SAME_AS_EN_US: Record<Locale, ReadonlySet<string>> = {
  "en-GB": new Set(),
  "es-MX": new Set(["bookingWidget.calendar.google", "bookingWidget.calendar.outlook"]),
  "fr-CA": new Set([
    "bookingWidget.calendar.outlook",
    "bookingWidget.confirmation.date",
    "bookingWidget.confirmation.table",
    "bookingWidget.dateParty.date",
    "manageReservation.date",
  ]),
};

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** A catalog value as a full-text matcher; `{{placeholders}}` match any run of text. */
function matcherFor(value: string): RegExp {
  const source = normalize(value)
    .split(/\{\{\w+\}\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".+?");
  return new RegExp(`^${source}$`);
}

/** en-US values the locale must not show: translated differently, or reverted without an acknowledgement. */
function forbiddenEnglish(locale: Locale): Array<{ key: string; value: string; match: RegExp }> {
  const sources: Array<[Flat, Flat, boolean]> = [
    [loadCatalog("en-US"), { ...loadCatalog("en-US"), ...loadCatalog(locale) }, true],
    [
      rialtoStrings(rialtoEnUS),
      { ...rialtoStrings(rialtoEnUS), ...rialtoStrings(RIALTO[locale]) },
      false,
    ],
  ];
  return sources.flatMap(([english, translated, checkReverts]) => {
    const spoken = new Set(Object.values(translated).map(normalize));
    return Object.entries(english)
      .filter(([key, value]) => {
        // Nothing to read once the placeholders are gone (a time range, a bare number).
        if (!/\p{L}/u.test(value.replace(/\{\{\w+\}\}/g, ""))) return false;
        // Differs here, unless the same words are another key's correct translation ("Table").
        if (translated[key] !== value) return !spoken.has(normalize(value));
        return (
          checkReverts &&
          !locale.startsWith("en") &&
          PUBLIC_NAMESPACE.test(key) &&
          !SAME_AS_EN_US[locale].has(key)
        );
      })
      .map(([key, value]) => ({ key, value, match: matcherFor(value) }));
  });
}

/**
 * KNOWN GAP, not an allowance: ToastProvider is mounted once at the app root
 * (main.tsx), outside the guest's WidgetLocaleScope, so its always-mounted
 * live region is labelled from the dashboard's locale ("Notifications") on
 * every public route. Tracked in #6737; remove this exclusion with its fix.
 */
const KNOWN_GAP_SELECTOR = '[role="region"]:has(> [aria-live])';

/** Every string a guest can read or hear on the page right now. */
async function visibleStrings(page: Page): Promise<string[]> {
  return page.evaluate((knownGap) => {
    const seen = new Set<string>();
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        style.visibility !== "hidden" && style.display !== "none" && el.getClientRects().length > 0
      );
    };
    for (const el of document.body.querySelectorAll("*")) {
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName) || !visible(el)) continue;
      if (el.matches(knownGap)) continue;
      const own = Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join(" ");
      seen.add(own);
      for (const attr of ["placeholder", "aria-label", "title", "alt"]) {
        seen.add(el.getAttribute(attr) ?? "");
      }
    }
    return Array.from(seen);
  }, KNOWN_GAP_SELECTOR);
}

/**
 * Text that a clipping box cuts off (outside a `data-truncate` cell), plus page-level
 * sideways scroll. Measures the text itself, not `scrollWidth`: decorations (a
 * connector line, a shine) widen `scrollWidth` without hiding a single letter.
 */
async function overflows(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      found.push(`page scrolls sideways (${root.scrollWidth} > ${root.clientWidth})`);
    }
    const clips = (el: Element) => ["hidden", "clip"].includes(getComputedStyle(el).overflowX);
    const clippingAncestor = (el: Element | null) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        if (clips(node)) return node;
      }
      return null;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest("[data-truncate], script, style")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const textBox = range.getBoundingClientRect();
      const clip = clippingAncestor(parent);
      if (textBox.width === 0 || !clip) continue;
      const box = clip.getBoundingClientRect();
      if (textBox.right > box.right + 1 || textBox.left < box.left - 1) {
        found.push(
          `"${text.slice(0, 40)}" is cut off by <${clip.tagName.toLowerCase()} class="${clip.getAttribute("class") ?? ""}">`
        );
      }
    }
    return found;
  });
}

async function sweep(page: Page, locale: Locale, where: string): Promise<void> {
  // Settle a pending locale load / step transition before reading the page.
  await page.waitForLoadState("networkidle");
  const forbidden = forbiddenEnglish(locale);
  const untranslated = (await visibleStrings(page))
    .map(normalize)
    .filter(Boolean)
    .flatMap((text) =>
      forbidden.filter((f) => f.match.test(text)).map((f) => `"${text}" is en-US ${f.key}`)
    );
  expect(untranslated, `${locale} ${where}: untranslated text`).toEqual([]);
  expect(await overflows(page), `${locale} ${where}: overflow outside data-truncate`).toEqual([]);
}

const ok = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ data }),
});

/** Records (and fails on) any same-origin request no mock answered. Install it before mockApi. */
async function trackUnmocked(page: Page, unmocked: string[]): Promise<void> {
  await page.route(
    (url) => url.hostname === "localhost" && /^\/(api|public)\//.test(url.pathname),
    (route) => {
      const url = new URL(route.request().url());
      unmocked.push(`${route.request().method()} ${url.pathname}`);
      return route.fulfill({ status: 599, contentType: "text/plain", body: "unmocked" });
    }
  );
}

/** Answers what the steps act on; installed after mockApi so it wins over its defaults. */
async function mockPublicRoutes(page: Page): Promise<void> {
  await page.route("**/public/v1/venues/*/guests/recognize*", (route) =>
    route.fulfill(ok({ recognized: false, firstName: null, visitCount: 0, hasPreferences: false }))
  );
  // mockApi's hold expires in the past, which resets the flow to time-slot mid-walk.
  await page.route("**/public/v1/venues/*/holds", (route) =>
    route.fulfill(
      ok({
        id: "hold_sweep_001",
        venueId: "ven_e2e_001",
        tableId: "tbl_e2e_001",
        date: "2026-05-17",
        startTime: "2026-05-17T18:00:00.000Z",
        endTime: "2026-05-17T19:30:00.000Z",
        partySize: 2,
        sessionId: "sess_sweep_001",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        createdAt: new Date().toISOString(),
      })
    )
  );
  await page.route("**/public/v1/reservations/manage*", (route) =>
    route.fulfill(
      ok({
        reservation: {
          id: "res_sweep_001",
          date: "2026-06-15",
          startTime: "2026-06-15T18:30:00.000Z",
          endTime: "2026-06-15T20:00:00.000Z",
          partySize: 4,
          guestName: "Priya Shah",
          guestEmail: "priya@example.com",
          status: "CONFIRMED",
          notes: null,
        },
        venue: {
          id: "ven_e2e_001",
          name: VENUE_NAME,
          slug: VENUE_SLUG,
          ianaTimezone: "America/New_York",
        },
      })
    )
  );
}

/** The target locale's own text for a catalog key — the sweep drives the UI by what the guest reads. */
function label(locale: Locale, key: string): string {
  const value = { ...loadCatalog("en-US"), ...loadCatalog(locale) }[key];
  if (!value) throw new Error(`No catalog value for ${key} in ${locale}`);
  return value;
}

/* eslint-disable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks -- Playwright fixtures, as in fixtures.ts */
const sweepTest = test.extend<{ unmocked: string[] }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright's fixture signature
  unmocked: async ({}, use) => {
    await use([]);
  },
  // Runs before `mockedPage` (which depends on `page`) installs mockApi, so this
  // handler is the lowest-priority one.
  page: async ({ page, unmocked }, use) => {
    await trackUnmocked(page, unmocked);
    await use(page);
  },
});
/* eslint-enable @eslint-react/rules-of-hooks, react-hooks/rules-of-hooks */

for (const locale of LOCALES) {
  sweepTest.describe(`locale sweep — ${locale}`, () => {
    sweepTest.beforeEach(async ({ mockedPage: page }) => {
      await mockPublicRoutes(page);
      await page.setViewportSize(PHONE);
      await page.addInitScript(([key, tag]) => localStorage.setItem(key, tag), [
        STORAGE_KEY,
        locale,
      ] as const);
    });

    sweepTest(
      "book/:venueSlug — date, time, details and confirmation steps",
      async ({ mockedPage: page, unmocked }) => {
        await page.goto(`book/${VENUE_SLUG}`);
        await expect(page.getByRole("heading", { name: VENUE_NAME })).toBeVisible();
        await sweep(page, locale, "date-party step");

        const bookingDate = new Date();
        bookingDate.setDate(bookingDate.getDate() + 3);
        await page.locator('input[type="date"]').fill(bookingDate.toISOString().slice(0, 10));
        await page
          .getByRole("button", { name: label(locale, "bookingWidget.dateParty.findTimes") })
          .click();

        await expect(page.getByRole("option").first()).toBeVisible();
        await sweep(page, locale, "time-slot step");
        await page.getByRole("option").first().click();

        await page
          .getByLabel(label(locale, "bookingWidget.details.email"))
          .fill("sweep@example.com");
        await page
          .getByLabel(label(locale, "bookingWidget.details.name"))
          .fill("Locale Sweep Guest");
        await sweep(page, locale, "guest-details step");
        await page
          .getByRole("button", { name: label(locale, "bookingWidget.details.complete") })
          .click();

        await expect(
          page.getByText(label(locale, "bookingWidget.confirmation.title"))
        ).toBeVisible();
        await sweep(page, locale, "confirmation step");
        expect(unmocked, "requests no mock answered").toEqual([]);
      }
    );

    sweepTest(
      "reservations/manage — details and cancel dialog",
      async ({ mockedPage: page, unmocked }) => {
        await page.goto(`reservations/manage?token=${MANAGE_TOKEN}`);
        await expect(page.getByRole("heading", { name: VENUE_NAME })).toBeVisible();
        await sweep(page, locale, "manage details");

        await page.getByRole("button", { name: label(locale, "manageReservation.cancel") }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await sweep(page, locale, "cancel dialog");
        expect(unmocked, "requests no mock answered").toEqual([]);
      }
    );
  });
}
