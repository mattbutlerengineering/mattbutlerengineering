/**
 * #5876 review: every gating criterion with `detection.type: "check"` runs
 * arbitrary logic no generic path/any-of/grep test exercises — mutation
 * testing found three of these (acmm:instruction-sync-gate,
 * acmm:instruction-rot-detection, acmm:auto-issue-gen) with zero coverage.
 * This is a tripwire, not a full test: it asserts every gating `check`
 * criterion's id is at least referenced by some test file, so a future
 * `check` criterion added without any test fails loudly instead of silently
 * joining that list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SCANNABLE_IDS_BY_LEVEL } from "../scannableIdsByLevel.js";
import { ALL_CRITERIA } from "../sources/index.js";

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const SELF_FILE = fileURLToPath(import.meta.url);

function gatingCheckCriteria() {
  const byId = new Map(ALL_CRITERIA.map((c) => [c.id, c]));
  const ids = [];
  for (const level of Object.keys(SCANNABLE_IDS_BY_LEVEL)) {
    for (const id of SCANNABLE_IDS_BY_LEVEL[level]) {
      const criterion = byId.get(id);
      if (criterion && criterion.detection.type === "check") ids.push(id);
    }
  }
  return ids;
}

function testFileContents() {
  return readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.js"))
    .map((f) => join(TESTS_DIR, f))
    .filter((p) => p !== SELF_FILE)
    .map((p) => readFileSync(p, "utf-8"));
}

test("every gating check-type criterion id is referenced by at least one test file", () => {
  const ids = gatingCheckCriteria();
  assert.ok(ids.length > 0, "expected at least one gating check-type criterion to exist");

  const contents = testFileContents();
  const untested = ids.filter((id) => !contents.some((content) => content.includes(id)));

  assert.deepEqual(
    untested,
    [],
    `gating check-type criteria with no test file referencing their id: ${untested.join(", ")}`
  );
});
