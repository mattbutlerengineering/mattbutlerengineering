import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES_DIR = __dirname;

// Every page-level h1 comes from the shared PageHeader (focus target for useFocusAfter,
// one title style). EmptyState's `headingLevel={1}` is a shared component, not a hand-built h1.
const OWN_H1 = /<h1[\s>]|as="h1"|<Heading[^>]*level=\{1\}/;

// Pages still hand-building an h1. Remove an entry once that page moves to PageHeader.
const NOT_YET_MIGRATED = new Set<string>();

const pageFiles = readdirSync(PAGES_DIR).filter(
  (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx") && !NOT_YET_MIGRATED.has(name)
);

describe("page headers", () => {
  it.each(pageFiles)("%s renders no h1 of its own", (name) => {
    const source = readFileSync(join(PAGES_DIR, name), "utf8");
    expect(source).not.toMatch(OWN_H1);
  });

  it.each([
    "FloorPlanEditorPage.tsx",
    "NotFoundPage.tsx",
    "ManageReservationPage.tsx",
    "InvitePage.tsx",
    "PublicMenuPage.tsx",
    "PublicMenusPage.tsx",
    "PublicBookingPage.tsx",
    "AuthFailurePage.tsx",
  ])("%s uses PageHeader", (name) => {
    expect(readFileSync(join(PAGES_DIR, name), "utf8")).toContain("<PageHeader");
  });
});
