import { test, expect } from "@playwright/test";
import {
  SEL,
  diffFingerprints,
  fingerprint,
  hospitalityReady,
  navLink,
  prepare,
  report,
  rialtoReady,
  settle,
} from "./support/harness.js";

// Spike record: with per-app stylesheet toggling, 0 diffs on two pages and 1 (margin 28px to 0)
// on the rialto Button page. The Accept line is zero; the Button page residual is an open risk
// the architecture names, so it fails here until it is explained or fixed.
const CASES = [
  { name: "rialto overview", path: "/rialto/", first: "/hospitality/timeline", app: SEL.rialto },
  {
    name: "rialto button page",
    path: "/rialto/components/button",
    first: "/hospitality/timeline",
    app: SEL.rialto,
  },
  {
    name: "hospitality guests",
    path: "/hospitality/guests",
    first: "/rialto/",
    app: SEL.hospitality,
  },
] as const;

for (const c of CASES) {
  test(`check 3: zero computed-style diffs, ${c.name}`, async ({ browser }, testInfo) => {
    // Baseline: today's standalone document, from the same target with the shell off.
    const baseContext = await browser.newContext({ viewport: { width: 1280, height: 600 } });
    const standalone = await baseContext.newPage();
    await prepare(standalone, testInfo, { shell: "off" });
    await standalone.goto(c.path);
    await settle(standalone);
    const base = await fingerprint(standalone, "#root");
    await baseContext.close();

    const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
    await prepare(page, testInfo);
    await page.goto(c.first);
    await settle(page);
    // A real crossing to the named page, by a plain link click, with the other app already
    // mounted; then a settled read.
    await page.evaluate((path) => {
      const a = document.createElement("a");
      a.href = path;
      a.textContent = "conformance crossing";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, c.path);
    await settle(page);

    const diff = diffFingerprints(base, await fingerprint(page, c.app));
    const sheets = await page.evaluate(() => ({
      active: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter(
        (l) => l.media !== "not all"
      ).length,
      total: document.querySelectorAll('link[rel="stylesheet"]').length,
    }));
    report("check 3", c.name, { ...diff, sheets });

    expect(diff.elementsCompared, "elements were compared").toBeGreaterThan(0);
    expect(diff.elementsDiffering, `differing elements: ${diff.samples.join("; ")}`).toBe(0);
  });
}

test("check 3: the nav's computed style is the same with either app visible", async ({
  page,
}, testInfo) => {
  await prepare(page, testInfo);
  await page.goto("/hospitality/timeline");
  await hospitalityReady(page);
  const inHospitality = await fingerprint(page, SEL.nav);
  await navLink(page, "Design System");
  await rialtoReady(page);
  await settle(page);
  const diff = diffFingerprints(inHospitality, await fingerprint(page, SEL.nav));
  report("check 3", "nav, hospitality visible vs rialto visible", diff);
  expect(diff.elementsDiffering, `nav differs: ${diff.samples.join("; ")}`).toBe(0);
});
