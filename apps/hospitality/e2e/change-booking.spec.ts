import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { buildSlotsBody } from "./api-mocks.js";
import { createProblemDetails } from "@mbe/types";

// Guest change-booking flow on the manage page (#6926). Server-side atomicity is pinned by the
// unit tests in #6903/#6913; this spec pins the UI contract on top: a successful change moves
// the booking, a lost race leaves the original visible and intact, abandoning releases the hold.

const MANAGE_TOKEN = "e2e-change-booking-token";
const SESSION_ID = "sess_e2e_change_001";
const HOLD_ID = "hold_e2e_change_001";

// The slots fixture is re-dated to the next 17 May so the date picker accepts it. In the venue's
// zone (America/New_York, EDT) 18:00Z is 2:00 PM and 18:30Z is 2:30 PM.
const slots = (JSON.parse(buildSlotsBody(new Date())) as { data: { time: string }[] }).data;
const ORIGINAL_START = slots.find((s) => s.time.endsWith("T18:00:00.000Z"))!.time;
const NEW_START = slots.find((s) => s.time.endsWith("T18:30:00.000Z"))!.time;
const DURATION_MS = 90 * 60_000;

const iso = (startTime: string, offsetMs = 0) =>
  new Date(new Date(startTime).getTime() + offsetMs).toISOString();

interface ChangeMocks {
  patchBodies: Record<string, unknown>[];
  patchSessionIds: (string | undefined)[];
  holdReleases: string[];
}

/** Spec-local overrides, registered after mockApi (special-requests.spec.ts precedent). */
async function mockManageFlow(page: Page, raceLost: boolean): Promise<ChangeMocks> {
  const mocks: ChangeMocks = { patchBodies: [], patchSessionIds: [], holdReleases: [] };
  let currentStart = ORIGINAL_START;

  const reservation = () => ({
    id: "res_e2e_change_001",
    date: currentStart.slice(0, 10),
    startTime: currentStart,
    endTime: iso(currentStart, DURATION_MS),
    partySize: 2,
    guestName: "Change E2E Guest",
    guestEmail: "change-e2e@example.com",
    status: "CONFIRMED",
    notes: null,
  });

  await page.route("**/public/v1/reservations/manage*", (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      mocks.patchBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      mocks.patchSessionIds.push(route.request().headers()["x-session-id"]);
      if (raceLost) {
        return route.fulfill({
          status: 409,
          contentType: "application/problem+json",
          body: JSON.stringify({
            ...createProblemDetails(409, "Conflict", "slot unavailable"),
            code: "SLOT_UNAVAILABLE",
          }),
        });
      }
      currentStart = NEW_START;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { reservation: reservation() } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          reservation: reservation(),
          venue: {
            id: "ven_e2e_001",
            name: "E2E Test Bistro",
            slug: "e2e-test-bistro",
            ianaTimezone: "America/New_York",
          },
        },
      }),
    });
  });

  const hold = {
    id: HOLD_ID,
    venueId: "ven_e2e_001",
    tableId: "tbl_e2e_001",
    date: NEW_START.slice(0, 10),
    startTime: NEW_START,
    endTime: iso(NEW_START, DURATION_MS),
    partySize: 2,
    sessionId: SESSION_ID,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  await page.route(/\/public\/v1\/venues\/[^/]+\/holds\/[^/?]+$/, (route) => {
    if (route.request().method() === "DELETE") {
      mocks.holdReleases.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: hold }),
    });
  });
  await page.route("**/public/v1/venues/*/holds", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: hold }),
    })
  );
  return mocks;
}

async function openChangeDialogAndPickNewTime(page: Page) {
  await page.goto(`reservations/manage?token=${MANAGE_TOKEN}`);
  await expect(page.getByText("2:00 PM – 3:30 PM")).toBeVisible();
  await page.getByRole("button", { name: "Change booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Change your booking" });
  await dialog.getByRole("button", { name: "Find Available Times" }).click();
  await dialog.getByRole("option", { name: "2:30 PM" }).click();
  await expect(dialog.getByRole("option", { name: "2:30 PM" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  return dialog;
}

test.describe("Guest change booking", () => {
  test("happy path: the booking moves and the guest is told", async ({ mockedPage }) => {
    const mocks = await mockManageFlow(mockedPage, false);
    const dialog = await openChangeDialogAndPickNewTime(mockedPage);

    const confirm = dialog.getByRole("button", { name: "Confirm change" });
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(mockedPage.getByRole("status")).toHaveText("Your booking has been updated.");
    await expect(mockedPage.getByText("2:30 PM – 4:00 PM")).toBeVisible();
    expect(mocks.patchBodies).toHaveLength(1);
    expect(mocks.patchBodies[0]).toMatchObject({ holdId: HOLD_ID });
    expect(mocks.patchSessionIds).toEqual([SESSION_ID]);
    expect(mocks.holdReleases).toHaveLength(0);
  });

  test("race lost: the original booking stays and the hold is released on close", async ({
    mockedPage,
  }) => {
    const mocks = await mockManageFlow(mockedPage, true);
    const dialog = await openChangeDialogAndPickNewTime(mockedPage);

    await dialog.getByRole("button", { name: "Confirm change" }).click();

    await expect(dialog.getByRole("alert")).toContainText("Your original booking is unchanged");
    expect(mocks.patchBodies).toHaveLength(1);

    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(mockedPage.getByText("2:00 PM – 3:30 PM")).toBeVisible();
    await expect.poll(() => mocks.holdReleases).toHaveLength(1);
    expect(mocks.holdReleases[0]).toContain(HOLD_ID);
  });

  test("abandon: closing after picking a slot releases the hold and sends no PATCH", async ({
    mockedPage,
  }) => {
    const mocks = await mockManageFlow(mockedPage, false);
    const dialog = await openChangeDialogAndPickNewTime(mockedPage);

    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();

    await expect.poll(() => mocks.holdReleases).toHaveLength(1);
    expect(mocks.holdReleases[0]).toContain(HOLD_ID);
    expect(mocks.patchBodies).toHaveLength(0);
    await expect(mockedPage.getByText("2:00 PM – 3:30 PM")).toBeVisible();
  });
});
