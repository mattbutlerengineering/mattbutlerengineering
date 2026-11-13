import type { Page } from "@playwright/test";
import { mockApi } from "../api-mocks.js";
import { mockDemoVenue, nextChristmasEve } from "../helpers/demo-venue.js";

/**
 * Setup for the availability launch-demo tour (docs/launches/availability-tour/). The launch-demo
 * browser recorder opens the app with no login, so the tour's first step calls
 * `prepareAvailabilityTour(page)`: it signs in a stand-in Manager and serves the hub spec's demo
 * venue through `mockApi`. Nothing reaches a real tenant or API.
 *
 * The dev server must be built with `DEMO_AUTH_ENV` (`pnpm demo:serve`), because oidc-client-ts
 * only reads a stored user whose key carries the app's own authority and client id. The tokens are
 * fixed placeholders: the API is mocked, so nothing ever verifies them.
 */

export const DEMO_AUTH_ENV = {
  VITE_AUTH_AUTHORITY: "https://launch-demo.invalid",
  VITE_AUTH_CLIENT_ID: "launch-demo",
} as const;

/** The hub on the demo dev server; absolute, because the recorder's page has no base URL. */
export const DEMO_HUB_URL = "http://localhost:3002/hospitality/availability";

/** Hours the stand-in session lasts; well past any recording, so no silent renew fires. */
const SESSION_HOURS = 8;

/** The localStorage entry oidc-client-ts reads as the signed-in user. */
export function demoSessionEntry(nowMs: number = Date.now()): { key: string; value: string } {
  const authority = DEMO_AUTH_ENV.VITE_AUTH_AUTHORITY;
  const user = {
    access_token: "launch-demo-access-token",
    id_token: "launch-demo-id-token",
    token_type: "Bearer",
    scope: "openid profile email",
    expires_at: Math.floor(nowMs / 1000) + SESSION_HOURS * 60 * 60,
    profile: {
      sub: "launch-demo|manager",
      email: "manager@launch-demo.invalid",
      email_verified: true,
      name: "Demo Manager",
      iss: `${authority}/`,
      aud: DEMO_AUTH_ENV.VITE_AUTH_CLIENT_ID,
    },
  };
  return {
    key: `oidc.user:${authority}:${DEMO_AUTH_ENV.VITE_AUTH_CLIENT_ID}`,
    value: JSON.stringify(user),
  };
}

/** The demo venue's special date as a manager types it in the hub's "Check a date" field. */
export function typedChristmasEve(): string {
  return `12/24/${nextChristmasEve().slice(0, 4)}`;
}

/** Signs in the stand-in Manager and mocks the demo venue, then reloads onto the hub. */
export async function prepareAvailabilityTour(page: Page): Promise<void> {
  const { key, value } = demoSessionEntry();
  await page.addInitScript(
    ([k, v]) => {
      localStorage.setItem(k, v);
    },
    [key, value] as const
  );
  // The reserved authority never resolves; answer it so no request hangs the recording.
  await page.route(`${DEMO_AUTH_ENV.VITE_AUTH_AUTHORITY}/**`, (route) =>
    route.fulfill({ status: 404, body: "" })
  );
  await mockApi(page);
  await mockDemoVenue(page);
  await page.goto(DEMO_HUB_URL);
}
