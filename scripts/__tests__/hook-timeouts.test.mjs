/**
 * Regression test for #8520: Claude Code's hook `timeout` is in SECONDS.
 * Entries written as milliseconds (30000, 5000, 3000) gave hooks caps of
 * 8.3 h / 1.4 h / 50 min, so a hung hook would stall the session for hours
 * instead of being killed. 600 s is the largest cap any hook legitimately
 * needs (cloud-session-bootstrap's full install).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SETTINGS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".claude",
  "settings.json"
);
const MAX_TIMEOUT_SECONDS = 600;

/** Every configured hook command with its event and timeout. */
function listHooks() {
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  return Object.entries(settings.hooks).flatMap(([event, groups]) =>
    groups.flatMap((group) =>
      group.hooks.map((hook) => ({ event, command: hook.command, timeout: hook.timeout }))
    )
  );
}

describe(".claude/settings.json hook timeouts", () => {
  it("finds hooks to check", () => {
    expect(listHooks().length).toBeGreaterThan(0);
  });

  it(`keeps every timeout in seconds (<= ${MAX_TIMEOUT_SECONDS})`, () => {
    const offenders = listHooks()
      .filter((hook) => hook.timeout !== undefined && hook.timeout > MAX_TIMEOUT_SECONDS)
      .map((hook) => `${hook.event} ${hook.timeout}: ${hook.command.slice(-80)}`);

    expect(offenders).toEqual([]);
  });
});
