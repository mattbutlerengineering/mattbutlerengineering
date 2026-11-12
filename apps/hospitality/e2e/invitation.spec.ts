import { readFileSync } from "fs";
import type { BrowserContext, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { pickBookingDate } from "./booking-date.js";
import { localDay } from "./local-day.js";

// The Invitation, end to end (#8669): a guest books, shares an invite link, a second guest
// opens it in a fresh browser context and RSVPs, the booker's manage page shows the count, the
// booker cancels, and the invite page shows the ended state. The invite token must never grant
// manage or cancel rights, so the invitee context is built with no storage state and no manage
// token, and the invite page is asserted to offer neither.
//
// Stateful mocks: one `store` is shared by both contexts' routes, so every read reflects the
// writes made before it (RSVPs, cancellation) instead of replaying a fixed fixture.

const VENUE_SLUG = "e2e-test-bistro";
const VENUE_NAME = "E2E Test Bistro";
const MANAGE_TOKEN = "e2e-invitation-manage-token";
const INVITE_TOKEN = "e2e-invitation-invite-token";
const HOLD_ID = "hold_e2e_invitation_001";
const PARTY_SIZE = 2;

interface InviteStore {
  minted: boolean;
  cancelled: boolean;
  rsvps: { firstName: string; status: "IN" | "OUT" }[];
  manageAuthHeaders: (string | undefined)[];
  inviteManageCalls: string[];
}

const jsonBody = (data: unknown) => JSON.stringify({ data });

/** A start three days out at 18:00Z, so the manage page is never in its "night of" layout. */
function bookingTimes() {
  const date = localDay(3);
  const start = new Date(`${date}T18:00:00.000Z`);
  return {
    date,
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 90 * 60_000).toISOString(),
  };
}

/** Routes the public booking confirmation so it hands back a manage token. */
async function mockBooking(page: Page): Promise<void> {
  const { date, startTime, endTime } = bookingTimes();
  const fixture = JSON.parse(readFileSync("e2e/fixtures/reservations-list.json", "utf-8")) as {
    data: Record<string, unknown>[];
  };
  await page.route("**/public/v1/venues/*/guests/recognize*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonBody({ recognized: false, firstName: null, visitCount: 0, hasPreferences: false }),
    })
  );
  // A future expiry: the shared hold fixture's is already past, which resets the flow mid-test.
  await page.route("**/public/v1/venues/*/holds", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonBody({
        id: HOLD_ID,
        venueId: "ven_e2e_001",
        tableId: "tbl_e2e_001",
        date,
        startTime,
        endTime,
        partySize: PARTY_SIZE,
        sessionId: "sess_e2e_invitation_001",
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        createdAt: new Date().toISOString(),
      }),
    })
  );
  await page.route("**/public/v1/venues/*/holds/*/confirm", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { ...fixture.data[0], date, startTime, endTime, partySize: PARTY_SIZE },
        manageToken: MANAGE_TOKEN,
      }),
    })
  );
}

/** The booker's side: the manage page, the invite summary and the invite mint. */
async function mockManage(context: BrowserContext | Page, store: InviteStore): Promise<void> {
  const { date, startTime, endTime } = bookingTimes();
  await context.route("**/public/v1/reservations/manage/invite", (route) => {
    store.manageAuthHeaders.push(route.request().headers()["authorization"]);
    if (route.request().method() === "POST") {
      store.minted = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonBody({ inviteToken: INVITE_TOKEN }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonBody({
        invited: store.minted,
        confirmed: store.rsvps.filter((r) => r.status === "IN").length,
        declined: store.rsvps.filter((r) => r.status === "OUT").length,
        partySize: PARTY_SIZE,
      }),
    });
  });
  await context.route("**/public/v1/reservations/manage*", (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      store.cancelled = true;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: jsonBody({ status: "CANCELLED" }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonBody({
        reservation: {
          id: "res_e2e_invitation_001",
          date,
          startTime,
          endTime,
          partySize: PARTY_SIZE,
          guestName: "Invitation E2E Guest",
          guestEmail: "invitation-e2e@example.com",
          status: store.cancelled ? "CANCELLED" : "CONFIRMED",
          notes: null,
        },
        venue: {
          id: "ven_e2e_001",
          name: VENUE_NAME,
          slug: VENUE_SLUG,
          ianaTimezone: "America/New_York",
        },
      }),
    });
  });
}

/** The invitee's side: public invite reads and RSVPs. Ended once the booking is cancelled. */
async function mockInvite(context: BrowserContext, store: InviteStore): Promise<void> {
  const { date } = bookingTimes();
  // Any manage-route call from the invitee context is a leak; record it and fail it closed.
  await context.route("**/public/v1/reservations/manage*", (route) => {
    store.inviteManageCalls.push(route.request().url());
    return route.fulfill({ status: 401, contentType: "application/json", body: "{}" });
  });
  await context.route(`**/public/v1/invites/${INVITE_TOKEN}`, (route) => {
    if (store.cancelled) {
      return route.fulfill({ status: 410, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonBody({
        venue: { name: VENUE_NAME, slug: VENUE_SLUG },
        date,
        time: "14:00",
        partySize: PARTY_SIZE,
        rsvps: store.rsvps,
        status: "CONFIRMED",
      }),
    });
  });
  await context.route(`**/public/v1/invites/${INVITE_TOKEN}/rsvp`, (route) => {
    store.rsvps.push(route.request().postDataJSON() as InviteStore["rsvps"][number]);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: jsonBody({ ok: true }),
    });
  });
}

test.describe("The Invitation: book, invite, RSVP, cancel", () => {
  test("a booked party's invite collects an RSVP and ends when the booking is cancelled", async ({
    mockedPage,
    browser,
    baseURL,
  }) => {
    const store: InviteStore = {
      minted: false,
      cancelled: false,
      rsvps: [],
      manageAuthHeaders: [],
      inviteManageCalls: [],
    };
    await mockBooking(mockedPage);
    await mockManage(mockedPage, store);

    // Capture the shared link: no native share sheet, and the clipboard write is recorded.
    await mockedPage.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            (window as unknown as { __sharedUrl: string }).__sharedUrl = text;
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });

    // 1. Book.
    await mockedPage.goto(`book/${VENUE_SLUG}`);
    await expect(mockedPage.getByRole("heading", { name: VENUE_NAME })).toBeVisible();
    await pickBookingDate(mockedPage, bookingTimes().date);
    await mockedPage.getByRole("button", { name: "Find Available Times" }).click();
    await mockedPage.getByRole("option").first().click();
    await mockedPage.getByLabel("Name").fill("Invitation E2E Guest");
    await mockedPage.getByLabel("Email").fill("invitation-e2e@example.com");
    await mockedPage.getByRole("button", { name: "Complete Reservation" }).click();
    await expect(mockedPage.getByText("Reservation Confirmed!")).toBeVisible();

    // 2. Share the invite.
    await mockedPage.getByRole("button", { name: "Invite your party" }).click();
    await expect(mockedPage.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
    const sharedUrl = await mockedPage.evaluate(
      () => (window as unknown as { __sharedUrl: string }).__sharedUrl
    );
    expect(store.minted).toBe(true);
    const invitePath = new URL(sharedUrl).pathname;
    expect(invitePath).toMatch(new RegExp(`/i/${INVITE_TOKEN}$`));
    // The link carries the invite token only, never the manage token.
    expect(sharedUrl).not.toContain(MANAGE_TOKEN);

    // 3. A second guest opens the link in a fresh context and RSVPs.
    const inviteeContext = await browser.newContext({ baseURL });
    try {
      await mockInvite(inviteeContext, store);
      const invitee = await inviteeContext.newPage();
      await invitee.goto(`i/${INVITE_TOKEN}`);
      await expect(invitee.getByTestId("invite-card")).toBeVisible();
      await expect(invitee.getByText(VENUE_NAME)).toBeVisible();
      // No manage or cancel affordance on the invite page.
      await expect(invitee.getByRole("button", { name: /cancel|change booking/i })).toHaveCount(0);
      await invitee.getByLabel("First name").fill("Sam");
      await invitee.getByRole("button", { name: "I'm in" }).click();
      await expect(invitee.getByText("Thanks, Sam. Your reply is on the list.")).toBeVisible();
      expect(store.rsvps).toEqual([{ firstName: "Sam", status: "IN" }]);
      expect(store.inviteManageCalls).toEqual([]);

      // 4. The booker's manage page shows the count.
      await mockedPage.goto(`reservations/manage?token=${MANAGE_TOKEN}`);
      await expect(mockedPage.getByText("1 of 2 confirmed")).toBeVisible();

      // 5. The booker cancels.
      await mockedPage.getByRole("button", { name: "Cancel Reservation" }).click();
      const dialog = mockedPage.getByRole("dialog");
      await dialog.getByRole("button", { name: "Cancel Reservation" }).click();
      await expect(mockedPage.getByText("This reservation has been cancelled.")).toBeVisible();
      expect(store.cancelled).toBe(true);

      // 6. The invite page now shows the ended state.
      await invitee.reload();
      await expect(
        invitee.getByRole("heading", { name: "This invitation has ended" })
      ).toBeVisible();
      await expect(invitee.getByTestId("invite-card")).toHaveCount(0);
    } finally {
      await inviteeContext.close();
    }
  });
});
