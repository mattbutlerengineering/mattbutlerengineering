import { test, expect } from "@playwright/test";
import { declareNotRun } from "./support/not-run.js";
import { unexpectedViolations, weakensScripts } from "./support/csp.js";
import {
  hospitalityReady,
  navLink,
  prepare,
  report,
  rialtoReady,
  settle,
  violations,
} from "./support/harness.js";

// Spike record: dynamic import() of same-origin entries allowed; an inline script is blocked
// (negative control); one `eval` violation from json-render-vendor-*.js was unexplained.
test("check 5: no CSP violations across two apps and lazy chunks, policy never weakened", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  const response = await page.goto("/hospitality/timeline");
  const policy = response?.headers()["content-security-policy"];
  if (!policy) {
    declareNotRun(
      testInfo,
      "the target served no Content-Security-Policy header; a run without a policy proves nothing"
    );
    return;
  }
  await hospitalityReady(page);
  await navLink(page, "Design System");
  await rialtoReady(page);
  await page
    .getByRole("link", { name: /^Button$/ })
    .first()
    .click()
    .catch(() => undefined);
  await settle(page);

  const found = await violations(page);
  const unexpected = unexpectedViolations(found);

  // Negative control: the harness can see a violation at all.
  const control = await page.evaluate(async () => {
    const s = document.createElement("script");
    s.textContent = "window.__inlineRan = true";
    document.head.appendChild(s);
    let evalBlocked = false;
    try {
      new Function("return 1")();
    } catch {
      evalBlocked = true;
    }
    const settleMs = 200;
    await new Promise((r) => setTimeout(r, settleMs));
    return {
      inlineRan: !!(window as unknown as { __inlineRan?: boolean }).__inlineRan,
      evalBlocked,
    };
  });
  report("check 5", "served policy", policy);
  report("check 5", "violations", found);
  report("check 5", "negative control", control);

  expect(weakensScripts(policy), "script-src has no unsafe-eval or unsafe-inline").toBe(false);
  expect(control.inlineRan, "negative control: an inline script is blocked").toBe(false);
  expect(control.evalBlocked, "negative control: eval is blocked").toBe(true);
  expect(unexpected, `CSP violations: ${JSON.stringify(unexpected)}`).toEqual([]);
});
