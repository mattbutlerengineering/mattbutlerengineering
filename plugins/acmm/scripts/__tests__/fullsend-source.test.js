/**
 * AC8 (#5853): fullsend:branch-protection-doc must compare the doc's claimed
 * required checks against the live branch-protection API, not just check the
 * doc exists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkBranchProtectionDoc, fullsendSource } from "../sources/fullsend.js";

function fixture(governanceBody) {
  const root = mkdtempSync(join(tmpdir(), "acmm-fullsend-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  if (governanceBody !== undefined) {
    writeFileSync(join(root, "docs", "governance.md"), governanceBody, "utf-8");
  }
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const DOC_WITH_STALE_CHECKS = `# Governance

### Required Status Checks

| Check               | Source                | Purpose                           |
| -------------------- | --------------------- | ---------------------------------- |
| **Lint**            | \`ci.yml\`              | ESLint                             |
| **Typecheck**       | \`ci.yml\`              | TS                                  |
`;

const DOC_MATCHING_LIVE = `# Governance

### Required Status Checks

| Check           | Source     | Purpose |
| ---------------- | ---------- | ------- |
| **CI Gate**      | \`ci.yml\` | Gate    |
`;

// Regression (#5876 review): docs/governance.md's real shape has a SECOND
// bolded-row table ("Human Review Required" — categories like **Security**,
// **Infrastructure**, not status checks at all) after the Required Status
// Checks section. The pre-fix parser collected every `| **X** |` row in the
// whole document, so this table's categories got treated as "documented
// required checks" too, and the criterion could never pass even once the
// Required Status Checks table itself was corrected to say CI Gate.
const DOC_WITH_TRAILING_UNRELATED_TABLE = `# Governance

### Required Status Checks

| Check           | Source     | Purpose |
| ---------------- | ---------- | ------- |
| **CI Gate**      | \`ci.yml\` | Gate    |

### Human Review Required

| Category            | Examples                     | Minimum Review  |
| -------------------- | ----------------------------- | ---------------- |
| **Security**         | Auth middleware, CODEOWNERS   | Owner + scan     |
| **Infrastructure**   | Pulumi stacks, Dockerfiles    | Owner approval   |
`;

test("checkBranchProtectionDoc: doc not found -> fails", () => {
  const fx = fixture(undefined);
  const result = checkBranchProtectionDoc(fx.root);
  assert.equal(result.passed, false);
  fx.cleanup();
});

test("checkBranchProtectionDoc: gh unavailable -> unverifiable (passed:null)", () => {
  const fx = fixture(DOC_WITH_STALE_CHECKS);
  const result = checkBranchProtectionDoc(fx.root, {
    execFileSyncFn: () => {
      throw new Error("gh not found");
    },
  });
  assert.equal(result.passed, null);
  fx.cleanup();
});

test("checkBranchProtectionDoc: doc lists stale checks that don't match live -> fails", () => {
  const fx = fixture(DOC_WITH_STALE_CHECKS);
  const result = checkBranchProtectionDoc(fx.root, {
    execFileSyncFn: () => JSON.stringify(["CI Gate"]),
  });
  assert.equal(result.passed, false);
  assert.ok(result.evidence.includes("Lint"));
  fx.cleanup();
});

test("checkBranchProtectionDoc: doc matches live required checks -> passes", () => {
  const fx = fixture(DOC_MATCHING_LIVE);
  const result = checkBranchProtectionDoc(fx.root, {
    execFileSyncFn: () => JSON.stringify(["CI Gate"]),
  });
  assert.equal(result.passed, true);
  fx.cleanup();
});

test("checkBranchProtectionDoc: only reads rows under Required Status Checks, not a later unrelated table", () => {
  const fx = fixture(DOC_WITH_TRAILING_UNRELATED_TABLE);
  const result = checkBranchProtectionDoc(fx.root, {
    execFileSyncFn: () => JSON.stringify(["CI Gate"]),
  });
  assert.equal(result.passed, true, result.evidence);
  fx.cleanup();
});

test("fullsendSource: no longer carries the duplicate ids merged elsewhere (#5851/#5853 AC6)", () => {
  const ids = new Set(fullsendSource.criteria.map((c) => c.id));
  for (const removed of [
    "fullsend:ci-cd-maturity",
    "fullsend:test-coverage",
    "fullsend:rollback-drill",
    "fullsend:observability-runbook",
    "fullsend:production-feedback",
    "fullsend:risk-assessment",
  ]) {
    assert.ok(!ids.has(removed), `${removed} should have been removed (merged elsewhere)`);
  }
  assert.ok(ids.has("fullsend:auto-merge-policy"));
  assert.ok(ids.has("fullsend:branch-protection-doc"));
});
