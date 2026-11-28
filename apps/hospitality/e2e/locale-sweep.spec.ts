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
 *  4. A CLIPPED PLACEHOLDER — rule 3 walks text nodes, and a placeholder is not
 *     one. On the gated Reservations route the search placeholder is measured
 *     against its input's content box, in en-US as well as the swept locales,
 *     at both viewports and at every 16px between them (#10250).
 *
 * Runs through the bare `test:e2e` script like the other public-route specs
 * (playwright.config.ts auto-discovers e2e/*.spec.ts; workflow-coverage.test.ts
 * pins both that and this file's presence). Every endpoint a step acts on is
 * mocked below, and `unmocked` fails the test on any request no mock answered.
 */
import type { Locator, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { enUS as rialtoEnUS, type RialtoMessages } from "@mattbutlerengineering/rialto/providers";
import { enGB as rialtoEnGB } from "@mattbutlerengineering/rialto/locales/en-GB";
import { esMX as rialtoEsMX } from "@mattbutlerengineering/rialto/locales/es-MX";
import { frCA as rialtoFrCA } from "@mattbutlerengineering/rialto/locales/fr-CA";
import { atLocal, localDay } from "./local-day.js";
import { test, expect } from "./fixtures.js";
import { pickBookingDate } from "./booking-date.js";
import { hasReadableLiteral, matcherFor } from "./fixtures/locale-sweep-readable.js";

// A third of the suite, so CI's shards would come out 241 and 115 tests if it
// stayed whole (#8038). Runs still use one worker, so nothing here overlaps;
// each test stages its own page and module-level values are read-only.
test.describe.configure({ mode: "parallel" });

const VENUE_SLUG = "e2e-test-bistro";
const VENUE_NAME = "E2E Test Bistro";
const MANAGE_TOKEN = "locale-sweep-token";
/** Mirrors WIDGET_LOCALE_STORAGE_KEY — the guest's own key, never the dashboard's. */
const STORAGE_KEY = "mbe-booking-widget-locale";
const PHONE = { width: 375, height: 812 } as const;

type Locale = "en-GB" | "es-MX" | "fr-CA";
const LOCALES: readonly Locale[] = ["en-GB", "es-MX", "fr-CA"];
/** The source locale has no translation to sweep, but its strings still have to fit. */
type StaffLocale = Locale | "en-US";

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

/** en-US values the locale must not show: translated differently, or reverted without an acknowledgement. */
function forbiddenEnglish(
  locale: Locale,
  revertScope: RegExp | null = PUBLIC_NAMESPACE
): Array<{ key: string; value: string; literal: boolean; match: RegExp }> {
  const sources: Array<[Flat, Flat, boolean]> = [
    [loadCatalog("en-US"), { ...loadCatalog("en-US"), ...loadCatalog(locale) }, true],
    [
      rialtoStrings(rialtoEnUS),
      { ...rialtoStrings(rialtoEnUS), ...rialtoStrings(RIALTO[locale]) },
      false,
    ],
  ];
  // The same words can be one source's cognate and the other's translation ("Chat").
  const spoken = new Set(
    sources.flatMap(([, translated]) => Object.values(translated)).map(normalize)
  );
  return sources.flatMap(([english, translated, checkReverts]) => {
    return Object.entries(english)
      .filter(([key, value]) => {
        // Nothing to read once the placeholders are gone (a time range, a bare number),
        // or only a short connector ("{{from}} to {{to}}") that matches any prose.
        if (!hasReadableLiteral(value)) return false;
        // Differs here, unless the same words are another key's correct translation ("Table").
        if (translated[key] !== value) return !spoken.has(normalize(value));
        return (
          checkReverts &&
          !locale.startsWith("en") &&
          revertScope?.test(key) === true &&
          !SAME_AS_EN_US[locale].has(key)
        );
      })
      .map(([key, value]) => ({
        key,
        value,
        literal: !/\{\{\w+\}\}/.test(value),
        match: matcherFor(value),
      }));
  });
}

/** Every string a guest can read or hear on the page right now. */
async function visibleStrings(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = new Set<string>();
    const visible = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        style.visibility !== "hidden" && style.display !== "none" && el.getClientRects().length > 0
      );
    };
    for (const el of document.body.querySelectorAll("*")) {
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName) || !visible(el)) continue;
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
  });
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
    // The nearest box that stops text overflowing sideways. A scroller (auto/scroll)
    // is the end of the search: its text is reachable, whatever clips further out.
    const clippingAncestor = (el: Element | null) => {
      for (let node = el; node && node !== document.body; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "hidden" || overflowX === "clip") return node;
        if (overflowX !== "visible") return null;
      }
      return null;
    };
    // Visually-hidden text (a 1px clipped box) is hidden on purpose, as is an
    // off-canvas skip link (parked more than a viewport left of its box, below).
    const hiddenOnPurpose = (el: Element) => {
      const { width, height } = el.getBoundingClientRect();
      return width <= 1 && height <= 1;
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
      // The clipping box itself may be the visually-hidden one (LiveStatus wraps its sentence
      // in a span inside a 1px region), so a clip that small hides on purpose too.
      if (textBox.width === 0 || !clip || hiddenOnPurpose(parent) || hiddenOnPurpose(clip)) {
        continue;
      }
      const box = clip.getBoundingClientRect();
      if (textBox.right < box.left - window.innerWidth) continue;
      if (textBox.right > box.right + 1 || textBox.left < box.left - 1) {
        found.push(
          `"${text.slice(0, 40)}" is cut off by <${clip.tagName.toLowerCase()} class="${clip.getAttribute("class") ?? ""}">`
        );
      }
    }
    return found;
  });
}

async function sweep(
  page: Page,
  locale: Locale,
  where: string,
  revertScope: RegExp | null = PUBLIC_NAMESPACE,
  userData: readonly string[] = []
): Promise<void> {
  // Settle a pending locale load / step transition before reading the page.
  await page.waitForLoadState("networkidle");
  const forbidden = forbiddenEnglish(locale, revertScope);
  const untranslated = (await visibleStrings(page))
    .map(normalize)
    .filter(Boolean)
    // A text node that is wholly a typed value (a service called "Lunch") is the venue's own
    // word, not UI copy, even where a catalog literal happens to read the same.
    .filter((text) => !userData.includes(text))
    .flatMap((text) => {
      // Literal values are matched against what is on screen; templates against the text
      // with typed values masked, where their `.+?` still matches the token.
      const masked = withTypedValuesMasked(text, userData);
      return forbidden
        .filter((f) => f.match.test(f.literal ? text : masked))
        .map((f) => `"${text}" is en-US ${f.key}`);
    });
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
  // The invite card reads its RSVP counts on mount (#8717). `manage*` above stops at the slash,
  // so this path needs its own answer; an invited party puts the counts line in the sweep too.
  await page.route("**/public/v1/reservations/manage/invite", (route) =>
    route.request().method() === "GET"
      ? route.fulfill(ok({ invited: true, confirmed: 2, declined: 0, partySize: 4 }))
      : route.fallback()
  );
}

/** The target locale's own text for a catalog key — the sweep drives the UI by what the guest reads. */
function label(locale: StaffLocale, key: string): string {
  const value = { ...loadCatalog("en-US"), ...loadCatalog(locale) }[key];
  if (!value) throw new Error(`No catalog value for ${key} in ${locale}`);
  return value;
}

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

        await pickBookingDate(page, localDay(3));
        await page
          .getByRole("button", { name: label(locale, "bookingWidget.dateParty.findTimes") })
          .click();

        await expect(page.getByRole("option").first()).toBeVisible();
        // One headed section per venue service, each named as the venue typed it in every locale.
        await expect(page.getByRole("heading", { name: "Early Seating" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Dinner", exact: true })).toBeVisible();
        // The slots mock is re-dated onto the picked day (api-mocks.ts buildSlotsBody): each
        // service's same-day list, plus Dinner's after-midnight list, are all swept.
        await expect(page.getByRole("listbox")).toHaveCount(3);
        await sweep(page, locale, "time-slot step", PUBLIC_NAMESPACE, userEnteredText());
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
/* ── Authenticated (Auth0-gated) routes ─────────────────────────────────────
 * Every gated `page` / `not-found` row of the route ledger that visual.spec.ts
 * walks, in the staff locale (the dashboard's own storage key). The `setup`
 * project's stored Auth0 session reaches them, exactly as in visual.spec.ts.
 * Only rule 1 (differing en-US text) and rule 3 (overflow) apply: the
 * revert-to-English rule needs a per-key cognate allow-list, which is kept for
 * the guest namespaces where a reverted value is a defect on a public page.
 */

/**
 * Text a person typed, not UI copy: guest names and notes, and the venue, table and
 * floor-plan names, in the mock data. A table called "Table 1" is the venue's own word and
 * stays as entered in every locale, even though the catalog also has a "Table {{name}}"
 * label. guest-segments.json is deliberately absent: its "New" / "VIP" are server labels
 * a locale may translate, and listing them would excuse an untranslated "New reservation".
 */
const USER_TEXT_FIELDS: Record<string, RegExp> = {
  "guests-list.json": /^(name|notes)$/,
  "reservations-list.json": /^(name|guestName|notes)$/,
  "tables-list.json": /^name$/,
  "floor-plans-list.json": /^name$/,
  "venues-list.json": /^name$/,
  "user-me.json": /^name$/,
  // The slots' venue service names ("Early Seating", "Dinner") head the guest time step as typed.
  "availability-slots.json": /^name$/,
};

/**
 * Names a Manager typed for the mock availability config's services (api-mocks.ts, inline rather
 * than a JSON fixture). Venue Setup lists them; "Lunch" and "Dinner" are also catalog words
 * (quick-setup presets) a locale translates.
 */
const MOCK_SERVICE_NAMES: readonly string[] = ["Lunch", "Dinner"];

function userEnteredText(): string[] {
  const collect = (node: unknown, fields: RegExp, key = ""): string[] => {
    if (typeof node === "string") return fields.test(key) ? [node] : [];
    if (node === null || typeof node !== "object") return [];
    return Object.entries(node).flatMap(([k, v]) => collect(v, fields, k));
  };
  const values = Object.entries(USER_TEXT_FIELDS).flatMap(([file, fields]) =>
    collect(
      JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8")),
      fields
    )
  );
  return Array.from(new Set([...values, ...MOCK_SERVICE_NAMES].map(normalize)));
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Stands in for a typed value; a private-use character, so no catalog value contains it. */
const TYPED = "";

/**
 * The visible string with each typed value (whole, on letter/number boundaries, longest
 * first) replaced by one token. The string is never cut: it is still judged whole, so
 * "New reservation" or "e.g. Table 1" is as visible to the check as before, while
 * "Table 1: Disponible" (a template's argument) no longer reads as the word "Table".
 */
function withTypedValuesMasked(text: string, userData: readonly string[]): string {
  const boundary = (value: string) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, "gu");
  return [...userData]
    .sort((a, b) => b.length - a.length)
    .reduce((rest, value) => rest.replace(boundary(value), TYPED), text);
}

/** The dashboard's own key (LOCALE_STORAGE_KEY in src/i18n/runtime.tsx) — never the widget's. */
const STAFF_STORAGE_KEY = "mbe-hospitality-locale";
const DESKTOP = { width: 1280, height: 720 } as const;
const VIEWPORTS = [PHONE, DESKTOP] as const;

const LEDGER = new URL("../../../metrics/ui-quality-ledger.jsonl", import.meta.url);
const ROUTE_FIXTURES = new URL("../../../scripts/ui-quality/route-fixtures.json", import.meta.url);

interface LedgerRow {
  route: string;
  app: string;
  kind: string;
  auth: string;
}

const routeFixtures: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(ROUTE_FIXTURES, "utf8")
);

/** The ledger is data, not an import: a gated route added to the app is swept the moment it lands. */
const GATED_ROUTES = readFileSync(LEDGER, "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as LedgerRow)
  .filter(
    (row) =>
      row.app === "hospitality" &&
      row.auth === "auth0" &&
      (row.kind === "page" || row.kind === "not-found")
  )
  .map((row) => row.route);

/** The ledger's path rule, relative to the `/hospitality/` baseURL (as in visual.spec.ts). */
function gatedPath(route: string): string {
  const path =
    route.includes(":") || route.includes("*")
      ? (routeFixtures["hospitality"]?.[route] ?? "/ui-quality-not-found")
      : route === "/"
        ? "/"
        : `/${route}`;
  return path.replace(/^\//, "");
}

/** Designed redirect: an operational venue's index route lands on the timeline. */
const LANDS_ON: Record<string, string> = { "/": "timeline" };

const VENUE_ID = "ven_e2e_001";
const USER_TEXT = userEnteredText();

/**
 * The editor route's floor plan. The shared fixture names its tables "Table 1"/"Table 2",
 * which is byte-for-byte the untranslated en-US canvas aria-label "Table {{label}}" — masking
 * those names as typed data would hide that key. Names that can't collide keep
 * floorPlan.canvas.tableAria checked on this route.
 */
const SHARED_PLAN = JSON.parse(
  readFileSync(new URL("./fixtures/floor-plans-list.json", import.meta.url), "utf8")
).data[0] as { tables: { name: string; tableNumber: string }[] };
const EDITOR_PLAN = {
  ...SHARED_PLAN,
  tables: SHARED_PLAN.tables.map((table) => ({ ...table, name: `Patio ${table.tableNumber}` })),
};
const SHARED_TABLE_NAMES = new Set(
  [
    ...SHARED_PLAN.tables,
    ...(
      JSON.parse(readFileSync(new URL("./fixtures/tables-list.json", import.meta.url), "utf8")) as {
        data: { name: string }[];
      }
    ).data,
  ].map((table) => normalize(table.name))
);

/** Typed values to mask on a route: the editor shows only EDITOR_PLAN's tables. */
function userTextFor(route: string): readonly string[] {
  if (route !== "availability/floor-plans/:id") return USER_TEXT;
  return [
    ...USER_TEXT.filter((value) => !SHARED_TABLE_NAMES.has(value)),
    ...EDITOR_PLAN.tables.map((table) => normalize(table.name)),
  ];
}

/**
 * Endpoints the gated routes reach that `mockApi` leaves to each spec
 * (briefing.spec.ts, floor-plan-status.spec.ts mount their own). Registered
 * after mockApi, so these win.
 */
async function mockGatedRoutes(page: Page, route: string): Promise<void> {
  const day = localDay();
  const entry = (id: string, start: string, end: string, guestName: string, partySize: number) => ({
    id,
    date: day,
    startTime: atLocal(start, day),
    endTime: atLocal(end, day),
    partySize,
    status: "CONFIRMED",
    notes: null,
    cancellationReason: null,
    cancellationNote: null,
    guestName,
    guestId: `gst_${id}`,
    userId: null,
    occasion: "anniversary",
    seatingPreference: null,
    tableId: "tbl_e2e_001",
    table: { id: "tbl_e2e_001", name: "Table 1", tableNumber: "1" },
    venueId: VENUE_ID,
    createdAt: `${day}T00:00:00.000Z`,
    updatedAt: `${day}T00:00:00.000Z`,
    guest: {
      id: `gst_${id}`,
      name: guestName,
      lastVisit: null,
      notes: null,
      staffNotes: [],
      communicationPreference: null,
      visitCount: 1,
      dietaryRestrictions: null,
      tags: [],
    },
  });
  const waiting = (
    id: string,
    guestName: string,
    partySize: number,
    position: number,
    wait: number
  ) => ({
    id,
    venueId: VENUE_ID,
    partySize,
    guestName,
    guestPhone: "555-0100",
    position,
    estimatedWaitMinutes: wait,
    status: "waiting",
    notifiedAt: null,
    expiresAt: null,
    createdAt: atLocal("17:00", day),
    updatedAt: atLocal("17:00", day),
  });
  const answers: ReadonlyArray<readonly [RegExp, unknown]> = [
    [
      /\/api\/v1\/briefing\?/,
      [
        entry("dinner", "18:30", "20:00", "Priya Shah", 4),
        entry("late", "21:00", "22:30", "Jordan Lee", 2),
      ],
    ],
    [
      /\/api\/v1\/guests\/lapsing\?/,
      [
        {
          guestId: "gst_lapsing",
          name: "Morgan Reyes",
          email: "morgan@example.com",
          phone: null,
          communicationPreference: "email_only",
          avgFrequencyDays: 21,
          daysSinceLastVisit: 49,
          daysOverdue: 28,
        },
      ],
    ],
    [
      /\/api\/v1\/waitlist\?/,
      [
        waiting("wl_sweep_1", "Priya Shah", 4, 1, 15),
        waiting("wl_sweep_2", "Jordan Lee", 2, 2, 30),
        waiting("wl_sweep_3", "Morgan Reyes", 6, 3, 45),
      ],
    ],
    [
      /\/api\/v1\/venues\/[^/?]+\/table-statuses$/,
      [{ tableId: "tbl_e2e_001", status: "available" }],
    ],
    // `availability/history` (availability-hub C2.6). No entries: a stored summary is en-US by
    // design (a record, not UI copy), so the empty state and the filters are what is swept.
    [
      /\/api\/v1\/venues\/[^/?]+\/availability\/changes(\?.*)?$/,
      { items: [], total: 0, offset: 0 },
    ],
    // `night` (#9483): the end-of-service summary, so the figures and their labels are swept.
    [
      /\/api\/v1\/reservations\/metrics\/end-of-service\?/,
      { date: day, venueId: VENUE_ID, covers: 84, tableTurns: 31, noShows: 1, turnedAway: null },
    ],
    // `timeline` (#9492): one suggestion, so the collapsed Autopilot panel's heading and count are swept.
    [
      /\/api\/v1\/reservations\/metrics\/autopilot-proposals\?/,
      {
        date: day,
        venueId: VENUE_ID,
        moves: [
          {
            id: "offer:w1>tbl_e2e_001",
            kind: "waitlist_offer",
            partyLabel: "Kim",
            partySize: 4,
            fromTableId: null,
            fromTableName: null,
            toTableId: "tbl_e2e_001",
            toTableName: "Table 1",
            startTime: `${day}T19:00:00.000Z`,
            endTime: `${day}T20:30:00.000Z`,
            reason: "Seat Kim (4) at Table 1",
          },
        ],
      },
    ],
    // `home` (#9485): the turned-away heatmap, with timed and no-time counts so the grid, the
    // hour labels, the weekday headers and the no-time row are all swept.
    [
      /\/api\/v1\/reservations\/metrics\/lost-demand\?/,
      {
        venueId: VENUE_ID,
        from: day,
        to: day,
        total: 14,
        cells: [
          { weekday: 5, hour: 19, searches: 6 },
          { weekday: 6, hour: 20, searches: 4 },
        ],
        anyTime: [{ weekday: 0, searches: 4 }],
      },
    ],
    // `home` (#9577): the add-a-seating estimate under the heatmap, so its picker labels and
    // result sentences are swept in every locale.
    [
      /\/api\/v1\/reservations\/metrics\/lost-demand\/what-if\?/,
      {
        venueId: VENUE_ID,
        from: day,
        to: day,
        weekday: 5,
        minute: 19 * 60 + 30,
        outcome: "estimated",
        searches: 6,
        windowStart: 19 * 60,
        windowEnd: 20 * 60,
        minParty: null,
        maxParty: null,
        anyTimeSearches: 4,
        nights: 4,
        perNight: 1.5,
      },
    ],
  ];
  for (const [pattern, data] of answers) {
    await page.route(pattern, (r) => r.fulfill(ok(data)));
  }
  // `availability/explain` (#10047) reads the engine's trace for the date and party its address
  // names, so the answer echoes the request. One bookable time and two removed for different
  // reasons (the shape availability-explain-day.spec.ts serves), so the reason copy is swept.
  await page.route(/\/api\/v1\/venues\/[^/?]+\/availability\/trace(\?.*)?$/, (r) => {
    const params = new URL(r.request().url()).searchParams;
    const serviceDate = params.get("date") ?? day;
    const partySize = Number(params.get("partySize") ?? 2);
    const at = (minute: number, rest: Record<string, unknown> = {}) => ({
      serviceId: "vs-dinner",
      serviceName: "Dinner",
      minute,
      time: `${Math.floor(minute / 60)}:00`,
      startsAt: null,
      outcome: "bookable",
      ...rest,
    });
    return r.fulfill(
      ok({
        serviceDate,
        partySize,
        channel: "online",
        basis: "current_rules",
        day: {
          serviceDate,
          scheduleId: "regular",
          services: [],
          closures: [],
          bookingOpen: { online: true, phone: true, waitlist: false },
          explanation: [],
        },
        times: [
          at(1020),
          at(1140, {
            outcome: "removed",
            reason: {
              code: "pacing",
              scope: "venue",
              limit: 3,
              windowMinutes: 15,
              covers: 3,
              partySize,
            },
          }),
          at(1200, { outcome: "removed", reason: { code: "no_free_table", suitableTables: 4 } }),
        ],
      })
    );
  });
  if (route === "availability/floor-plans/:id") {
    await page.route(/\/api\/v1\/floor-plans\/[^/?]+(\?.*)?$/, (r) => r.fulfill(ok(EDITOR_PLAN)));
  }
}

/** The staff locale, and (for `admin`) the permission RequireAdmin reads off the OIDC profile. */
async function stageStaffSession(page: Page, locale: StaffLocale, route: string): Promise<void> {
  await page.addInitScript(
    ([key, tag, current]) => {
      localStorage.setItem(key, tag);
      if (current !== "admin") return;
      for (const stored of Object.keys(localStorage)) {
        if (!stored.startsWith("oidc.user:")) continue;
        const user = JSON.parse(localStorage.getItem(stored) ?? "{}") as Record<string, unknown>;
        const profile = {
          ...(user["profile"] as object),
          permissions: ["admin"],
        };
        localStorage.setItem(stored, JSON.stringify({ ...user, profile }));
      }
    },
    [STAFF_STORAGE_KEY, locale, route] as const
  );
}

interface PlaceholderFit {
  placeholder: string;
  /** Width the placeholder text needs, in CSS px. */
  textWidth: number;
  /** Width of the input's content box, in CSS px. */
  room: number;
}

/**
 * How wide an input's placeholder is, and how much room its content box has for it. The text is
 * measured on a canvas in the placeholder's own font: Chromium reports `scrollWidth` equal to
 * `clientWidth` on an input whose placeholder is clipped (#10244), so those cannot tell.
 */
async function placeholderFit(input: Locator): Promise<PlaceholderFit> {
  return input.evaluate(async (el: HTMLInputElement) => {
    const own = getComputedStyle(el);
    const pseudo = getComputedStyle(el, "::placeholder");
    // The `font` shorthand can read empty, so the canvas font is built from its longhands;
    // `::placeholder` wins where it sets one.
    const read = (property: string) =>
      pseudo.getPropertyValue(property) || own.getPropertyValue(property);
    const font = ["font-style", "font-weight", "font-size", "font-family"].map(read).join(" ");
    const placeholder = el.placeholder;
    // Before the webfont arrives the canvas would measure a fallback face.
    await document.fonts.load(font, placeholder);
    await document.fonts.ready;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("no 2d canvas context to measure the placeholder with");
    context.font = font;
    // "normal" parses to NaN; a length computes to px and is added after every character.
    const tracking = Number.parseFloat(read("letter-spacing")) || 0;
    const px = (property: string) => Number.parseFloat(own.getPropertyValue(property)) || 0;
    const edges = ["border-left-width", "padding-left", "padding-right", "border-right-width"];
    return {
      placeholder,
      textWidth: context.measureText(placeholder).width + tracking * placeholder.length,
      // From the border box, not `clientWidth`: on a text input Chromium reports the inner
      // editor's width there (padding already taken off), so subtracting padding counts it twice.
      room: el.getBoundingClientRect().width - edges.reduce((sum, edge) => sum + px(edge), 0),
    };
  });
}

const RESERVATIONS = "reservations";

/**
 * Widths the desktop test walks its search field through. The field grows into whatever its
 * toolbar row has left, so at the two swept viewports it is wide whatever its basis; a basis
 * that is too small only clips in the bands where the field shares a row and has nothing left to
 * grow into (measured for #10250: with a 12rem basis nothing clips at 375 or 1280, and es-MX
 * clips across most of 416 to 1216). Resized in place, so no route is loaded a second time.
 */
const SEARCH_SCAN = { from: 320, to: DESKTOP.width, step: 16 } as const;

/**
 * The Reservations search placeholder has been clipped twice (#10241, #10244). Only this input is
 * checked: `placeholderFit` works on any input, but run over every gated route it finds the Admin
 * and Guests search placeholders clipped today (measured for #10250), so widening this to every
 * route waits on those fixes.
 */
async function expectSearchPlaceholderFits(
  page: Page,
  locale: StaffLocale,
  viewport: { width: number; height: number }
): Promise<void> {
  const where = `${locale} ${RESERVATIONS} @ ${viewport.width}x${viewport.height}`;
  const input = page.getByRole("textbox", {
    name: label(locale, "reservations.search.label"),
    exact: true,
  });
  await expect(input, `${where}: search field`).toBeVisible();
  const { placeholder, textWidth, room } = await placeholderFit(input);
  // An empty or foreign placeholder would fit without proving anything.
  expect(placeholder, `${where}: search placeholder`).toBe(
    label(locale, "reservations.search.placeholder")
  );
  expect(
    textWidth,
    `${where}: placeholder "${placeholder}" needs ${textWidth.toFixed(1)}px, its input has room for ${room.toFixed(1)}px`
  ).toBeLessThanOrEqual(room);
  if (viewport.width !== DESKTOP.width) return;

  const clipped: string[] = [];
  for (let width = SEARCH_SCAN.from; width <= SEARCH_SCAN.to; width += SEARCH_SCAN.step) {
    await page.setViewportSize({ width, height: viewport.height });
    const at = await placeholderFit(input);
    if (at.textWidth > at.room) {
      clipped.push(
        `${width}px wide: needs ${at.textWidth.toFixed(1)}px, room for ${at.room.toFixed(1)}px`
      );
    }
  }
  expect(
    clipped,
    `${locale} ${RESERVATIONS}: placeholder "${placeholder}" is clipped between ${SEARCH_SCAN.from}px and ${SEARCH_SCAN.to}px`
  ).toEqual([]);
}

for (const locale of LOCALES) {
  sweepTest.describe(`locale sweep (authenticated) — ${locale}`, () => {
    for (const route of GATED_ROUTES) {
      for (const viewport of VIEWPORTS) {
        sweepTest(
          `${route} @ ${viewport.width}x${viewport.height}`,
          async ({ mockedPage: page, unmocked }) => {
            await mockGatedRoutes(page, route);
            await stageStaffSession(page, locale, route);
            await page.setViewportSize(viewport);
            await page.emulateMedia({ reducedMotion: "reduce" });
            // The fixture's own load of the app root answered before these mocks existed.
            unmocked.splice(0);
            const path = gatedPath(route);
            await page.goto(path);
            await page.waitForLoadState("networkidle");
            const landing = LANDS_ON[route] ?? path;
            const requested = new URL(landing, test.info().project.use.baseURL).pathname;
            const trim = (p: string) => p.replace(/\/$/, "");
            await expect(page, `${route} redirected away from ${requested}`).toHaveURL(
              (url) => trim(url.pathname) === trim(requested)
            );
            await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
            // DashboardLayout's ErrorBoundary fallback is translated, so look for it in the locale.
            await expect(
              page.getByText(label(locale, "layout.errorHeading"), { exact: true }),
              `${route} crashed into the error boundary`
            ).toHaveCount(0);
            // A blank, skeleton-only or crashed page has no heading to find.
            await expect(page.getByRole("main")).toBeVisible();
            await expect(page.getByRole("heading").first()).toBeVisible();
            if (route === "waitlist") {
              await expect(page.getByTestId("waitlist-empty")).toHaveCount(0);
              await expect(page.getByText("Priya Shah")).toBeVisible();
            }
            await expect(page.locator("html")).toHaveAttribute("lang", locale);
            await sweep(page, locale, route, null, userTextFor(route));
            if (route === RESERVATIONS) await expectSearchPlaceholderFits(page, locale, viewport);
            expect(unmocked, `${route}: requests no mock answered`).toEqual([]);
          }
        );
      }
    }
  });
}

// en-US is the source catalog, so the sweep above has nothing to compare it with and never
// loads it; its placeholder still has to fit.
sweepTest.describe("Reservations search placeholder — en-US", () => {
  for (const viewport of VIEWPORTS) {
    sweepTest(
      `${RESERVATIONS} @ ${viewport.width}x${viewport.height}`,
      async ({ mockedPage: page, unmocked }) => {
        await mockGatedRoutes(page, RESERVATIONS);
        await stageStaffSession(page, "en-US", RESERVATIONS);
        await page.setViewportSize(viewport);
        // The fixture's own load of the app root answered before these mocks existed.
        unmocked.splice(0);
        await page.goto(gatedPath(RESERVATIONS));
        await page.waitForLoadState("networkidle");
        await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
        await expectSearchPlaceholderFits(page, "en-US", viewport);
        expect(unmocked, `${RESERVATIONS}: requests no mock answered`).toEqual([]);
      }
    );
  }
});
