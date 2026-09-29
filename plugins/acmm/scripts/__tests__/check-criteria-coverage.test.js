/**
 * #5876 review: every gating criterion with `detection.type: "check"` runs
 * arbitrary logic no generic path/any-of/grep test exercises — mutation
 * testing found three of these (acmm:instruction-sync-gate,
 * acmm:instruction-rot-detection, acmm:auto-issue-gen) with zero coverage.
 * This is a tripwire, not a full test: it asserts every gating `check`
 * criterion's `check` FUNCTION NAME is referenced by some test file, so a
 * future `check`-type criterion added without any test fails loudly instead
 * of silently joining that list.
 *
 * Deliberately keys on `c.check.name`, not `c.id`: an id-string search (the
 * first version of this tripwire) is satisfied by stale fixtures that merely
 * mention the id — e.g. computeLevel.test.js's level-count fixture arrays, or
 * detection.test.js's old `type:"active"` auto-issue-gen fixtures predating
 * #5853's retarget — neither of which exercises the actual `check()` logic at
 * all. A function-name reference is much closer to "some test imports and
 * calls this specific implementation".
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
  const criteria = [];
  for (const level of Object.keys(SCANNABLE_IDS_BY_LEVEL)) {
    for (const id of SCANNABLE_IDS_BY_LEVEL[level]) {
      const criterion = byId.get(id);
      if (criterion && criterion.detection.type === "check") criteria.push(criterion);
    }
  }
  return criteria;
}

function testFileContents() {
  return readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith(".test.js"))
    .map((f) => join(TESTS_DIR, f))
    .filter((p) => p !== SELF_FILE)
    .map((p) => readFileSync(p, "utf-8"));
}

test("every gating check-type criterion's check() function is referenced by name in some test file", () => {
  const criteria = gatingCheckCriteria();
  assert.ok(criteria.length > 0, "expected at least one gating check-type criterion to exist");

  for (const c of criteria) {
    assert.equal(
      typeof c.check,
      "function",
      `${c.id} has detection.type "check" but no check() function`
    );
    assert.ok(
      c.check.name,
      `${c.id}'s check function must be named (not an anonymous arrow) so this tripwire can find it`
    );
  }

  const contents = testFileContents();
  const untested = criteria
    .map((c) => ({ id: c.id, fnName: c.check.name }))
    .filter(({ fnName }) => !contents.some((content) => content.includes(fnName)));

  assert.deepEqual(
    untested,
    [],
    `gating check-type criteria whose check function name is not referenced by any test file: ${untested
      .map((u) => `${u.id} (${u.fnName})`)
      .join(", ")}`
  );
});
