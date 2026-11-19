/**
 * local:code-graph (#9165) — the repo itself must satisfy its own detection,
 * not just the detection engine's hermetic fixtures (those live in detection.test.js).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluate } from "../evaluate.js";
import { ALL_CRITERIA } from "../sources/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");
const criterion = ALL_CRITERIA.find((c) => c.id === "local:code-graph");

test("local:code-graph detects against the real repo tree", () => {
  assert.ok(criterion, "local:code-graph criterion should exist");
  const result = evaluate(criterion, repoRoot);
  assert.equal(result.verdict, "pass", result.evidence);
});
