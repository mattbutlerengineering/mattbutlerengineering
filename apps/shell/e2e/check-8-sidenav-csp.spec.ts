import { test, expect } from "@playwright/test";
import { declareNotRun } from "./support/not-run.js";
import { unexpectedViolations, weakensScripts } from "./support/csp.js";
import { hospitalityReady, prepare, report, violations } from "./support/harness.js";

// Spike check 8 was NOT RUN: no side-nav remote existed. This spec is the target for WO-03 to
// WO-06. The remote is a same-origin dynamic import() of /hospitality-sidenav/remote.js.
const REMOTE_PATH = "/hospitality-sidenav/remote.js";

test("check 8: the side-nav remote loads under the real CSP with no violations", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  const remoteResponses: Array<{ status: number; type: string }> = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === REMOTE_PATH) {
      remoteResponses.push({ status: r.status(), type: r.headers()["content-type"] ?? "" });
    }
  });
  const response = await page.goto("/hospitality/timeline");
  const policy = response?.headers()["content-security-policy"];
  if (!policy) {
    declareNotRun(
      testInfo,
      "the target served no Content-Security-Policy header; the remote cannot be proven " +
        "under a policy that is not there (run against the real edge)"
    );
    return;
  }
  await hospitalityReady(page);
  await page.waitForTimeout(1500);

  const found = unexpectedViolations(await violations(page));
  const sidebar = await page.evaluate(() => ({
    navLinksOrButtons: document.querySelectorAll("nav button, nav a").length,
  }));
  report("check 8", "remote under the real CSP", {
    remoteResponses,
    violations: found,
    weakened: weakensScripts(policy),
    sidebar,
  });

  expect(remoteResponses.length, "the remote was requested").toBeGreaterThan(0);
  expect(remoteResponses[0]?.status, "the remote was served").toBe(200);
  expect(remoteResponses[0]?.type, "as JavaScript").toMatch(/javascript/);
  expect(weakensScripts(policy), "no unsafe-eval or unsafe-inline").toBe(false);
  expect(found, `CSP violations: ${JSON.stringify(found)}`).toEqual([]);
  expect(sidebar.navLinksOrButtons, "the sidebar rendered").toBeGreaterThan(0);
});
