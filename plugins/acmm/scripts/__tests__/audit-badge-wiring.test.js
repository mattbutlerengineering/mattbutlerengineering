/**
 * Guards the audit.js -> updateBadge() call site.
 *
 * badge.js's freshness check treats a missing `state` argument as "unknown
 * lastRun" and always renders the grey stale badge (see badge.test.js
 * "backwards compat" case) — that fallback is correct for badge.js in
 * isolation, but if audit.js's own call site drops the `nextState` argument,
 * every `--badge` run silently regresses to a stale-looking badge even
 * though the audit just completed. badge.js's unit tests can't catch that:
 * they call updateBadge() directly and always pass state deliberately.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const auditPath = join(dirname(fileURLToPath(import.meta.url)), "..", "audit.js");

test("audit.js passes state to updateBadge() so freshness reflects the run that just happened", () => {
  const source = readFileSync(auditPath, "utf-8");
  const match = source.match(/updateBadge\(([^)]*)\)/);
  assert.ok(match, "expected an updateBadge(...) call in audit.js");
  const args = match[1].split(",").map((a) => a.trim());
  assert.ok(
    args.length >= 3 && args[2].length > 0,
    `updateBadge() call must pass a state argument (e.g. nextState), got: updateBadge(${match[1]})`
  );
});
