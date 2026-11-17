// @vitest-environment node
/**
 * WCAG 2.2 SC 2.5.8 (AA): pointer targets are at least 24x24 CSS px. The
 * "Gen Playground" logo button strips its padding and measured 119x22, with no
 * touch floor (rialto's coarse-pointer floor only covers Button size "sm", and
 * the header's "Templates" and "Sign out" are "sm", so they are covered). The
 * icon toggles are already 32px; this pins the logo button to the same floor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(import.meta.dirname, "AppShell.module.css"), "utf8");

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("AppShell header target size", () => {
  it("keeps the logo button at least 32px tall", () => {
    expect(ruleBody(".logoButton")).toMatch(/min-block-size:\s*32px/);
  });
});
