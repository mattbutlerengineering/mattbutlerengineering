import { test, expect } from "@playwright/test";
import {
  SENTINEL,
  SESSION,
  hospitalityReady,
  navLink,
  prepare,
  report,
  rialtoReady,
  storageKey,
} from "./support/harness.js";

// Spike record (stand-in session only): the token sits in localStorage `oidc.user:*`, readable
// by any same-origin script, and true today in a standalone rialto-web document too. New in one
// document: a `fetch` wrapper installed by earlier code captured hospitality's Authorization
// header. This spec REPORTS the measured facts. It does not pass or fail on reachability: the
// design accepted and contained it (architecture.md, "Token exposure"). Real sign-in is WO-25.
test("check 6: token reachability from public app code is measured and reported", async ({
  page,
  browser,
}, testInfo) => {
  await prepare(page, testInfo);
  const key = storageKey(SESSION!);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  await navLink(page, "Design System");
  await rialtoReady(page);

  // Code running while rialto-web is visible installs a wrapper; then hospitality makes requests.
  const hostedStorage = await page.evaluate(
    ({ k, sentinel }) => {
      const w = window as unknown as { __seen: boolean[] };
      w.__seen = [];
      const real = window.fetch;
      window.fetch = (input, init) => {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        );
        const auth = headers.get("authorization");
        if (auth) w.__seen.push(auth.endsWith(sentinel));
        return real(input, init);
      };
      return {
        tokenReadable: (localStorage.getItem(k) ?? "").includes(sentinel),
        hiddenDomTextLength: (document.querySelector("[data-app=hospitality]")?.textContent ?? "")
          .length,
      };
    },
    { k: key, sentinel: SENTINEL }
  );
  await navLink(page, "Hospitality");
  await hospitalityReady(page);
  await page.getByRole("button", { name: "Guests", exact: true }).first().click();
  await page.waitForTimeout(1500);
  const wrapperCaptured = await page.evaluate(() =>
    (window as unknown as { __seen: boolean[] }).__seen.some(Boolean)
  );

  // Baseline: today's separate standalone rialto-web document, same origin.
  const context = await browser.newContext();
  const baseline = await context.newPage();
  await prepare(baseline, testInfo, { shell: "off" });
  await baseline.goto("/rialto/");
  await baseline.waitForLoadState("load");
  const standaloneReadable = await baseline.evaluate(
    ({ k, sentinel }) => (localStorage.getItem(k) ?? "").includes(sentinel),
    { k: key, sentinel: SENTINEL }
  );
  await context.close();

  const measured = {
    hostedTokenReadableFromPublicCode: hostedStorage.tokenReadable,
    standaloneTokenReadableFromPublicCode: standaloneReadable,
    fetchWrapperCapturedAuthorization: wrapperCaptured,
    hiddenAppDomTextLength: hostedStorage.hiddenDomTextLength,
    basis: "stand-in session; real Auth0 sign-in is checked in WO-25",
  };
  report("check 6", "token reachability, measured", measured);
  testInfo.annotations.push({ type: "measured", description: JSON.stringify(measured) });

  expect(typeof measured.hostedTokenReadableFromPublicCode).toBe("boolean");
  expect(typeof measured.standaloneTokenReadableFromPublicCode).toBe("boolean");
  expect(typeof measured.fetchWrapperCapturedAuthorization).toBe("boolean");
});
