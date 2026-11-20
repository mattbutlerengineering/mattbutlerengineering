import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));

/**
 * `.claude/rules/ui-quality.md` bans decorative gradients
 * (agent-built/gradient-background). Functional uses are allowlisted with
 * their reason.
 */
const ALLOWED = new Map<string, string>([
  ["components/venue-onboarding/LaunchStagePanel.module.css", "dashed-line trick, not decoration"],
]);

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return cssFiles(full);
    return name.endsWith(".css") ? [full] : [];
  });
}

describe("hospitality CSS", () => {
  it("has no decorative linear gradients", () => {
    const offenders = cssFiles(SRC)
      .map((file) => relative(SRC, file))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => /linear-gradient\(/.test(readFileSync(join(SRC, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
