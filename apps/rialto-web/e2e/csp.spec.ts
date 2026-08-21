/**
 * rialto-web under the real production Content-Security-Policy.
 *
 * See docs/fixes/e2e-behind-edge-csp/ for why this exists: the rest of the
 * suite is served by a vite server that sets no CSP at all, so every
 * CSP-caused defect in this app was invisible to E2E by construction. Two
 * shipped outages came through that hole.
 */

import { test, expect } from "@playwright/test";
import { applyEdgeCsp } from "./support/edge-csp";

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
