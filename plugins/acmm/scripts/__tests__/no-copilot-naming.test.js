/**
 * feature:acmm-close-gaps: this repo runs Claude, not GitHub Copilot. The two
 * criteria that used to be Copilot-named keep their ids (upstream parity,
 * upstream-parity.test.js) but must no longer name or detect Copilot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ALL_CRITERIA } from "../sources/index.js";
import { DROPPED_UPSTREAM_IDS } from "../sources/upstream-parity.js";
import { readFileSync } from "node:fs";

const KEPT_IDS = ["acmm:copilot-instructions"];

function find(id) {
  const criterion = ALL_CRITERIA.find((c) => c.id === id);
  assert.ok(criterion, `${id} must stay (upstream parity)`);
  return criterion;
}

test("copilot-instructions keeps its id and level (upstream parity)", () => {
  assert.equal(find("acmm:copilot-instructions").level, 2);
});

for (const id of KEPT_IDS) {
  test(`${id}: no visible text or detection path names Copilot`, () => {
    const { id: _id, check: _check, ...visible } = find(id);
    assert.doesNotMatch(JSON.stringify(visible), /copilot/i);
  });
}

test("copilot-review-apply is dropped: absent from the catalog, listed with a reason", () => {
  assert.equal(
    ALL_CRITERIA.some((c) => c.id === "acmm:copilot-review-apply"),
    false
  );
  const reason = DROPPED_UPSTREAM_IDS["acmm:copilot-review-apply"];
  assert.ok(reason && reason.length > 20, "drop must carry a reason");
});

test("copilot-instructions is satisfied by the scoped rules directory this repo has", () => {
  const { detection } = find("acmm:copilot-instructions");
  assert.equal(detection.pattern, ".claude/rules/");
});

test("the L2 agent-instructions OR-group (computeLevel.js) no longer lists the Copilot file", () => {
  const source = readFileSync(new URL("../computeLevel.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /copilot/i);
});
