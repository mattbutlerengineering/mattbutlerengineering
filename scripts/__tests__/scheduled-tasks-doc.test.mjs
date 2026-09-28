/**
 * Regression test for #5759: docs/scheduled-tasks.md referenced a `/schedule`
 * skill that has never existed in this repo (no `.claude/skills/schedule/`),
 * and its own "Editing a routine" section contradicted the fix two paragraphs
 * later by also describing "a single `RemoteTrigger` tool with an `action`
 * parameter" — a shape that does not match the real Claude Code Remote MCP
 * tool surface (discrete `list_triggers` / `create_trigger` / `update_trigger`
 * / `fire_trigger` / `delete_trigger` tools). Same drift class as the
 * `/reflect` fix check-skill-references.mjs guards, but scoped to this one
 * doc — scheduled-tasks.md is excluded from check-skill-references.mjs's
 * instruction-file scan (it documents HTTP-route-shaped names like `/public`
 * that would false-positive there).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const doc = readFileSync(join(ROOT, "docs/scheduled-tasks.md"), "utf8");

describe("docs/scheduled-tasks.md", () => {
  it("does not reference a `/schedule` skill", () => {
    expect(doc).not.toMatch(/`\/schedule`/);
    expect(doc).not.toMatch(/^\/schedule\b/m);
  });

  it("does not describe a single `RemoteTrigger` tool with an `action` parameter", () => {
    expect(doc).not.toMatch(/single `RemoteTrigger` tool with an `action`/);
  });

  it("describes the real discrete MCP trigger tools in the intro", () => {
    const introSection = doc.slice(0, doc.indexOf("## Recreated"));
    expect(introSection).toMatch(/list_triggers/);
  });
});
