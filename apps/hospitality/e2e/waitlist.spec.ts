import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { ERROR_COPY } from "../src/lib/describe-api-error.js";
// Screenshots saved to e2e/screenshots/{spec}-{state}.png on test run

// The page's single live region (LiveStatus). Every sentence is asserted with `timeout: 1000` —
// that is the contract (ux.md B3.1: spoken within 1 s), measured here on purpose; the unit tests
// cannot time it (the announce is synchronous once the mutation resolves — no timers to fake).
// If a shared CI runner ever misses the window, that is the NFR failing, not the spec. Filtered by sentence: rialto's Skeleton and the
// layout can also carry role=status, so a bare getByRole("status") is a strict-mode collision.
const spoken = (page: Page, sentence: string): Locator =>
  page.getByRole("status").filter({ hasText: sentence });

// Each entry's Card carries data-testid="waitlist-entry-<id>"; ids are minted by the mock
// (`wl_e2e_<timestamp>`), so the card is found by the guest's name, never by id.
const entryCard = (page: Page, guestName: string): Locator =>
  page.getByTestId(/^waitlist-entry-/).filter({ hasText: guestName });

async function addGuest(page: Page, guestName: string, phone: string, partySize: number) {
  await page.getByLabel(/guest name/i).fill(guestName);
  await page.getByLabel(/guest phone/i).fill(phone);
  await page.getByRole("button", { name: String(partySize), exact: true }).click();
  await page.getByRole("button", { name: /add to waitlist/i }).click();
}

// What the page computes for the toast's "View on Timeline" link (`localDateString(new Date())`),
// evaluated in the browser so the oracle shares the page's clock and zone, not Node's.
const browserLocalToday = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  });

test.describe("Hospitality waitlist [6/6]: add -> list -> seat", () => {
  test("every outcome is spoken within a second and focus lands on the named control — add, cancel, notify, seat, then the toast to the Timeline", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("waitlist");

    // Waitlist starts empty for this venue in the mocked session.
    await expect(mockedPage.getByTestId("waitlist-empty")).toBeVisible();

    // Add: the sentence, then focus back on Guest name — the Host adding one walk-up is adding
    // the next (the one deliberate exception to the opener rule).
    await addGuest(mockedPage, "Priya Shah", "(555) 234-5678", 2);
    await expect(spoken(mockedPage, "Added Priya Shah, party of 2, to the waitlist.")).toHaveCount(
      1,
      { timeout: 1000 }
    );
    await expect(mockedPage.getByLabel(/guest name/i)).toBeFocused();
    await expect(mockedPage.getByTestId("waitlist-empty")).toHaveCount(0);
    // By card, not getByText: the spoken sentence also contains the name (strict-mode collision).
    await expect(entryCard(mockedPage, "Priya Shah")).toBeVisible();
    await expect(
      entryCard(mockedPage, "Priya Shah").getByText("#1", { exact: true })
    ).toBeVisible();
    await mockedPage.screenshot({ path: "e2e/screenshots/waitlist-added.png", fullPage: true });

    await addGuest(mockedPage, "Marcus Lee", "(555) 345-6789", 4);
    await expect(spoken(mockedPage, "Added Marcus Lee, party of 4, to the waitlist.")).toHaveCount(
      1,
      { timeout: 1000 }
    );
    await addGuest(mockedPage, "Dana Ortiz", "(555) 456-7890", 2);
    await expect(spoken(mockedPage, "Added Dana Ortiz, party of 2, to the waitlist.")).toHaveCount(
      1,
      { timeout: 1000 }
    );

    // Cancel the last entry while others remain: no next card, so focus goes to the page heading.
    await entryCard(mockedPage, "Dana Ortiz")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(spoken(mockedPage, "Removed Dana Ortiz from the waitlist.")).toHaveCount(1, {
      timeout: 1000,
    });
    await expect(entryCard(mockedPage, "Dana Ortiz")).toHaveCount(0);
    await expect(mockedPage.getByRole("heading", { level: 1, name: "Waitlist" })).toBeFocused();

    // Notify the first entry: the list is status "waiting" only (the service's listWaiting, the
    // mock alike), so the notified party leaves it and focus goes to the next entry's card.
    await entryCard(mockedPage, "Priya Shah")
      .getByRole("button", { name: "Notify", exact: true })
      .click();
    await expect(spoken(mockedPage, "Notified Priya Shah.")).toHaveCount(1, { timeout: 1000 });
    await expect(entryCard(mockedPage, "Priya Shah")).toHaveCount(0);
    await expect(entryCard(mockedPage, "Marcus Lee")).toBeFocused();

    // Seat the survivor — a table is auto-selected (smallest AVAILABLE table that fits a party
    // of 4 is Table 1), so "Seat" is immediately available without an explicit table pick.
    // The oracle for the toast link is read BEFORE the click: the toast auto-dismisses after 4 s
    // (rialto Toast), so nothing but the contract's own assertions sits between Seat and the
    // "View on Timeline" click.
    const localToday = await browserLocalToday(mockedPage);
    await entryCard(mockedPage, "Marcus Lee")
      .getByRole("button", { name: "Seat", exact: true })
      .click();
    await expect(spoken(mockedPage, "Seated Marcus Lee at Table 1.")).toHaveCount(1, {
      timeout: 1000,
    });
    // The list is empty now, so focus goes to the empty block once it renders — which also proves
    // the row left the list (the block renders only for an empty list).
    await expect(mockedPage.getByTestId("waitlist-empty")).toBeFocused();

    // The success toast carries the same sentence and a "View on Timeline" action that opens
    // today's Timeline with the walk-in reservation selected (its id from the walk-in response).
    const notifications = mockedPage.getByRole("region", { name: "Notifications" });
    await notifications.getByRole("button", { name: "View on Timeline", exact: true }).click();
    await expect(mockedPage).toHaveURL(
      /\/hospitality\/timeline\?date=\d{4}-\d{2}-\d{2}&selected=res_e2e_walkin_\d+$/
    );
    expect(new URL(mockedPage.url()).searchParams.get("date")).toBe(localToday);
    await expect(
      mockedPage.getByTestId(/^reservation-block-/).filter({ hasText: "Marcus Lee" })
    ).toBeVisible();
  });

  test("a 500 on add says 'Not added.' with the house sentence — the raw request line never renders", async ({
    mockedPage,
  }) => {
    // Registered AFTER mockApi so it wins (LIFO). The glob has no `?`, so the list GET
    // (`/waitlist?venueId=…`) never matches it; the method check is belt and braces. 500, not
    // 503 — the api-client retries 502/503/504.
    await mockedPage.route("**/api/v1/waitlist", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: '{"error":"server error"}',
          })
        : route.fallback()
    );
    await mockedPage.goto("waitlist");
    await expect(mockedPage.getByTestId("waitlist-empty")).toBeVisible();

    await addGuest(mockedPage, "Priya Shah", "(555) 234-5678", 2);

    // Filtered by title: DashboardLayout's session Banner is also role=alert in CI.
    const alert = mockedPage.getByRole("alert").filter({ hasText: "Not added." });
    await expect(alert).toContainText(ERROR_COPY.serverError.detail);
    await expect(mockedPage.getByText(/failed: 500/)).toHaveCount(0);
    // Nothing was added, so nothing is spoken as an outcome and nothing typed is thrown away.
    await expect(spoken(mockedPage, "Added Priya Shah")).toHaveCount(0);
    await expect(mockedPage.getByLabel(/guest name/i)).toHaveValue("Priya Shah");
    await expect(mockedPage.getByTestId("waitlist-empty")).toBeVisible();
  });
});

test.describe("Hospitality waitlist — row controls at 1024 × 768 (NF INCLUSIVE)", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("Seat, Notify and Cancel are each at least 44 × 44", async ({ mockedPage }) => {
    await mockedPage.goto("waitlist");
    await addGuest(mockedPage, "Priya Shah", "(555) 234-5678", 2);
    const card = entryCard(mockedPage, "Priya Shah");
    await expect(card).toBeVisible();

    for (const name of ["Seat", "Notify", "Cancel"]) {
      const box = await card.getByRole("button", { name, exact: true }).boundingBox();
      expect(box, `${name} has a box`).not.toBeNull();
      expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    }
  });
});
