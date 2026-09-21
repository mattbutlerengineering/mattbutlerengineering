/**
 * Executes the dedup search string itself (#5553 review finding).
 *
 * The decision module this feeds is pure, well-tested, and was green on a
 * version of the search that returned nothing at all: the query carried
 * `state:all`, which is not a GitHub Search API qualifier — `state=all`
 * belongs to the REST *list* endpoint. The API does not reject it. It answers
 * HTTP 200 with `total_count: 0`, so `fetchExistingSentryIssues()` returned an
 * empty array rather than `null`, the fail-closed branch never engaged, and
 * the dedup elected to file a fifth duplicate of the very Sentry ID the issue
 * was about.
 *
 * Measured on this repo at the time of writing: the query below returns 17,
 * the same query plus `state:all` returns 0.
 *
 * Every unit test in the PR passed while the live path was broken, because
 * nothing exercised the query. This file exercises the query.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const TRIAGE = readFileSync(
  resolve(ROOT, ".claude/skills/sentry-triage/scripts/triage.mjs"),
  "utf8"
);

/** The search query template as the script actually spells it. */
function searchQuery() {
  const match = /SENTRY_ISSUE_SEARCH_QUERY = `([^`]+)`/.exec(TRIAGE);
  expect(match, "triage.mjs exports SENTRY_ISSUE_SEARCH_QUERY").not.toBeNull();
  return match?.[1] ?? "";
}

describe("sentry-triage dedup search query", () => {
  it("never carries state:all, which silently matches nothing", () => {
    expect(searchQuery()).not.toMatch(/state:all/);
    expect(TRIAGE).not.toMatch(/q=[^`"']*state:all/);
  });

  it("omits state: entirely — the Search API idiom for any state", () => {
    // Restricting to open is the original defect (#5553): a closed duplicate
    // goes unseen and gets re-filed.
    expect(searchQuery()).not.toMatch(/state:/);
  });

  it("scopes to this repo's sentry-labelled issues", () => {
    const q = searchQuery();
    expect(q).toContain("label:sentry");
    expect(q).toContain("is:issue");
    expect(q).toMatch(/repo:\$\{REPO\}/);
  });

  it("treats a truncated page as a failed search, not as no-match", () => {
    // The Search API caps a page at 100 and this query spans all history, so
    // dropping older matches silently fails in the file-a-duplicate direction.
    expect(TRIAGE).toMatch(/total_count[\s\S]{0,80}items\.length[\s\S]{0,40}return null/);
  });
});
