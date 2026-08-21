/**
 * rialto-web under the real production Content-Security-Policy.
 *
 * See docs/fixes/e2e-behind-edge-csp/ for why this exists: the rest of the
 * suite is served by a vite server that sets no CSP at all, so every
 * CSP-caused defect in this app was invisible to E2E by construction. Two
 * shipped outages came through that hole.
 */

import { test, expect } from "@playwright/test";
import { buildCspDirectives } from "@mbe/edge-worker/csp.js";
import { applyEdgeCsp } from "./support/edge-csp";

/**
 * Representative of the distinct document and asset shapes this app serves.
 * Not all 26 routes a11y-pages.spec.ts audits — five is the coverage
 * architecture.md settled on, and each one is measured clean.
 */
const COVERED_ROUTES = [
  { name: "overview", path: "./" },
  { name: "component page", path: "components/button" },
  { name: "login demo", path: "demos/login" },
  { name: "telemetry demo", path: "demos/telemetry" },
  { name: "visual-test harness", path: "visual-test" },
];

/** The nonce the edge minted for this response, read back out of the policy. */
function nonceFrom(policy: string | undefined): string {
  const match = /'nonce-([0-9a-f]{32})'/.exec(policy ?? "");
  if (!match) throw new Error(`no nonce in Content-Security-Policy: ${policy ?? "(absent)"}`);
  return match[1];
}

for (const { name, path } of COVERED_ROUTES) {
  test(`${name} (${path}) runs clean under the production CSP`, async ({ context, page }) => {
    const recorder = await applyEdgeCsp(context);

    // Relative navigation — an absolute path would drop the /rialto/ base
    // from the configured baseURL and land on the preview server's root.
    const response = await page.goto(path);

    // --- A1: the policy is in force -------------------------------------
    // Guards the class where the harness quietly serves no policy at all and
    // a green A2/A3 therefore means nothing.
    const policy = response?.headers()["content-security-policy"];
    expect(policy, "navigation response must carry the production CSP").toBeTruthy();
    const nonce = nonceFrom(policy);
    // Equality against the real builder, not a copy: if the edge's policy
    // changes and the harness does not, this is what notices.
    expect(policy).toBe(buildCspDirectives(nonce));

    // Read-after-settle, never read-after-sleep. A lazy route chunk can raise
    // a violation after `load` but before `networkidle`, so draining earlier
    // under-reports; a waitForTimeout is the flake this ordering prevents.
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#root"), "app must have mounted before draining").not.toBeEmpty();

    // --- A2: every script carries that nonce -----------------------------
    // Deliberately stricter than the policy: 'self' would admit an un-nonced
    // same-origin script, which A3 cannot see. Read the IDL property — once
    // CSP is applied the browser scrubs the content attribute, so
    // getAttribute("nonce") returns "" on a perfectly correct page.
    const scriptNonces = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script")).map((script) => ({
        nonce: script.nonce,
        src: script.src || "(inline)",
      }))
    );
    expect(scriptNonces.length, "expected the document to contain scripts").toBeGreaterThan(0);
    expect(
      scriptNonces.filter((script) => script.nonce !== nonce),
      "every <script> must carry the document's nonce"
    ).toEqual([]);

    // --- A3: nothing was refused -----------------------------------------
    expect(await recorder.drain(page), "the production CSP refused something").toEqual([]);
  });
}

test.describe("edge-CSP fixture contract", () => {
  test("applies the policy to the document and leaves other requests untouched", async ({
    context,
    page,
  }) => {
    await applyEdgeCsp(context);

    const nonDocumentCspHeaders: string[] = [];
    let nonDocumentResponses = 0;
    page.on("response", (response) => {
      if (response.request().resourceType() === "document") return;
      nonDocumentResponses += 1;
      const header = response.headers()["content-security-policy"];
      if (header)
        nonDocumentCspHeaders.push(`${response.request().resourceType()} ${response.url()}`);
    });

    const response = await page.goto("./");
    await page.waitForLoadState("networkidle");

    const policy = response?.headers()["content-security-policy"];
    expect(policy, "document response must carry the production CSP").toBeTruthy();
    // The nonce form the edge uses: a UUID with its dashes stripped.
    expect(policy).toMatch(/'nonce-[0-9a-f]{32}'/);

    expect(
      nonDocumentResponses,
      "expected sub-resource requests to have been made"
    ).toBeGreaterThan(0);
    expect(nonDocumentCspHeaders, "non-document requests must pass through untouched").toEqual([]);
  });

  test("records violations with the full four-field shape", async ({ context, page }) => {
    // A frame from an origin frame-src does not allow. Deliberately not the
    // rialto-web-fonts defect — that one belongs to the negative self-test —
    // and deliberately offline: CSP refuses the frame before any DNS lookup.
    const recorder = await applyEdgeCsp(context, {
      mutate: (html) =>
        html.replace("</body>", '<iframe src="https://blocked.invalid/"></iframe></body>'),
    });

    await page.goto("./");
    await page.waitForLoadState("networkidle");

    const violations = await recorder.drain(page);
    expect(violations.length).toBeGreaterThan(0);
    expect(Object.keys(violations[0]).sort()).toEqual([
      "blockedURI",
      "documentURI",
      "effectiveDirective",
      "sample",
    ]);
    expect(violations[0].effectiveDirective).toBe("frame-src");
    expect(violations[0].blockedURI).toContain("blocked.invalid");
    expect(violations[0].documentURI).toContain("/rialto/");

    // drain clears: a second read must not re-report the same violation.
    expect(await recorder.drain(page)).toEqual([]);
  });
});
