import type { Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import {
  createLiveEventBus,
  mockApi,
  mockLiveEventStream,
  mockNightOfManage,
  type LiveEventBus,
  type NightOfMock,
} from "./api-mocks.js";
import { atLocal } from "./local-day.js";

// On My Way [7/7] (#8653): a guest's night-of signal reaches the staff views with no reload.
//
// Two independent browser contexts share one Node-side event bus (`LiveEventBus`, api-mocks.ts):
// the guest's `POST …/manage/signal` publishes the `reservation:guest-signal` event the real API
// emits, and the staff context's held event stream delivers it. The staff page is loaded once and
// never reloaded; every assertion below is on what the live feed did to it.
//
// The reservation is the staff fixture's first booking (res_e2e_001, 6 PM local, party of 4,
// Alice Johnson). Both pages pin the browser clock 30 minutes before the start, inside the
// 3-hour window in which the guest's signal buttons are enabled.

const RESERVATION_ID = "res_e2e_001";
const MANAGE_TOKEN = "e2e-on-my-way-token";

const startTime = () => atLocal("18:00:00.000");
const endTime = () => atLocal("19:30:00.000");
const clockNow = () => new Date(atLocal("17:30:00.000"));

interface Fixtures {
  bus: LiveEventBus;
  guest: { page: Page; mock: NightOfMock };
  staff: Page;
}

const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright's fixture signature
  bus: async ({}, use) => {
    await use(createLiveEventBus());
  },

  // The guest has no session: a bare context, not the project's signed-in storage state.
  guest: async ({ browser, baseURL, bus }, use) => {
    const context = await browser.newContext(baseURL ? { baseURL } : {});
    const page = await context.newPage();
    await mockApi(page);
    const mock = await mockNightOfManage(page, bus, {
      id: RESERVATION_ID,
      startTime: startTime(),
      endTime: endTime(),
      partySize: 4,
      guestName: "Alice Johnson",
    });
    await page.clock.setFixedTime(clockNow());
    await page.goto(`reservations/manage?token=${MANAGE_TOKEN}`);
    await use({ page, mock });
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  },

  // The staff member: the project's signed-in storage state, mocked API, live feed from the bus.
  staff: async ({ page, bus }, use) => {
    await mockApi(page);
    await mockLiveEventStream(page, bus);
    await page.clock.setFixedTime(clockNow());
    await page.goto("timeline");
    await expect(page.getByTestId(`reservation-block-${RESERVATION_ID}`)).toBeVisible();
    await use(page);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  },
});

test.describe("On My Way: a guest signal reaches staff without a reload", () => {
  test("Running 15 min late puts the +15 badge on the staff timeline", async ({ guest, staff }) => {
    await expect(staff.getByTestId("guest-signal-badge")).toHaveCount(0);

    await guest.page.getByRole("button", { name: /^Running 15 min late$/ }).click();
    await expect(
      guest.page.getByRole("status").filter({ hasText: "E2E Test Bistro" })
    ).toBeVisible();
    expect(guest.mock.posted).toEqual([{ kind: "running-late", minutes: 15 }]);

    const badge = staff.getByTestId("guest-signal-badge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("+15");
    // The signal is information only: the booking itself is untouched.
    await expect(staff.getByTestId(`reservation-block-${RESERVATION_ID}`)).toBeVisible();
  });

  test("We're here shows the arrival toast on the staff screen", async ({ guest, staff }) => {
    const notifications = staff.getByRole("region", { name: "Notifications" });
    await expect(notifications).not.toContainText("Alice Johnson");

    await guest.page.getByRole("button", { name: /^We're here$/ }).click();
    expect(guest.mock.posted).toEqual([{ kind: "arrived" }]);

    await expect(notifications).toContainText("Alice Johnson");
    await expect(notifications).toContainText("party of 4");
    // No badge: "arrived" is the chime/toast's job, not the timeline's.
    await expect(staff.getByTestId("guest-signal-badge")).toHaveCount(0);
  });
});
