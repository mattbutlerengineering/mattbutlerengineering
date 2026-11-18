import { test, expect } from "@playwright/test";
import {
  SEL,
  hospitalityReady,
  navLink,
  prepare,
  report,
  rialtoReady,
  trackDocuments,
} from "./support/harness.js";

const ROUND_TRIPS = 7;

// Spike record: 1 document request over 17 navigations and 7 round trips; the nav node and
// rect were unchanged and never removed.
test("check 1: crossing costs no document load and no nav remount", async ({ page }, testInfo) => {
  await prepare(page, testInfo);
  const docs = trackDocuments(page);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);

  await page.evaluate((navSel) => {
    const w = window as unknown as Record<string, unknown>;
    const nav = document.querySelector(navSel);
    w["__docMarker"] = "doc-1";
    w["__navNode"] = nav;
    w["__navRect"] = JSON.stringify(nav?.getBoundingClientRect());
    w["__navRemovals"] = 0;
    new MutationObserver((records) =>
      records.forEach((r) => {
        w["__navRemovals"] = (w["__navRemovals"] as number) + r.removedNodes.length;
      })
    ).observe(nav!.parentElement!, { childList: true });
  }, SEL.nav);

  for (let i = 0; i < ROUND_TRIPS; i++) {
    await navLink(page, "Design System");
    await rialtoReady(page);
    await navLink(page, "Hospitality");
    await hospitalityReady(page);
  }
  await page.goBack();
  await rialtoReady(page);
  await page.goForward();
  await hospitalityReady(page);

  const after = await page.evaluate((navSel) => {
    const w = window as unknown as Record<string, unknown>;
    const nav = document.querySelector(navSel);
    return {
      documentMarker: w["__docMarker"],
      navSameNode: w["__navNode"] === nav,
      navNodeFound: !!w["__navNode"],
      navRemovals: w["__navRemovals"],
      navRectUnchanged: w["__navRect"] === JSON.stringify(nav?.getBoundingClientRect()),
    };
  }, SEL.nav);
  report("check 1", `${ROUND_TRIPS} round trips plus back and forward`, {
    documentRequests: docs.documentRequests,
    ...after,
  });

  expect(docs.documentRequests, "document requests over the whole run").toBe(1);
  expect(after.navNodeFound, "the nav exists").toBe(true);
  expect(after.documentMarker, "the document survived").toBe("doc-1");
  expect(after.navSameNode, "the nav is the same DOM node").toBe(true);
  expect(after.navRemovals, "the nav was never removed").toBe(0);
  expect(after.navRectUnchanged, "the nav rect did not move").toBe(true);
});
