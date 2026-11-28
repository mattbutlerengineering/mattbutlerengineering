import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guard for #9999: a `var(--rialto-*)` naming a token nobody defines silently
// falls back to the inherited value (PrivacyPage headings lost their weight,
// links lost their accent colour) with no error anywhere.

const WEB_SRC = __dirname;
const RIALTO_SRC = path.join(__dirname, "..", "..", "..", "packages", "rialto", "src");

const SOURCE_FILE = /\.(css|tsx?)$/;
const TEST_FILE = /\.test\.tsx?$/;

function walk(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return SOURCE_FILE.test(entry.name) ? [full] : [];
  });
}

function matchAll(files: readonly string[], pattern: RegExp): ReadonlyMap<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of files) {
    for (const [, name] of readFileSync(file, "utf8").matchAll(pattern)) {
      // Both patterns have exactly one capture group, so `name` is always set.
      if (name === undefined) continue;
      found.set(name, [...(found.get(name) ?? []), path.relative(WEB_SRC, file)]);
    }
  }
  return found;
}

// Definitions: `--rialto-x: value` in CSS, or a `"--rialto-x": value` style key
// in TSX/TS (runtime-set custom properties), anywhere in rialto or this app.
const DEFINITION = /(--rialto-[a-z0-9-]+)["']?\s*:/g;
const USAGE = /var\(\s*(--rialto-[a-z0-9-]+)/g;

// Known-undefined tokens not yet fixed, each with a reason. Keep empty.
const ALLOWLIST: ReadonlySet<string> = new Set<string>();

describe("rialto-web references only defined --rialto-* tokens", () => {
  it("every var(--rialto-*) in src resolves to a defined custom property", () => {
    const defined = matchAll([...walk(RIALTO_SRC), ...walk(WEB_SRC)], DEFINITION);
    const used = matchAll(
      walk(WEB_SRC).filter((file) => !TEST_FILE.test(file)),
      USAGE
    );

    const undefinedTokens = [...used]
      // A trailing "-" is a template-literal prefix (`var(--rialto-space-${n})`),
      // not a complete name; it cannot be checked statically.
      .filter(([name]) => !name.endsWith("-"))
      .filter(([name]) => !defined.has(name) && !ALLOWLIST.has(name))
      .map(([name, files]) => `${name} (in ${[...new Set(files)].join(", ")})`);

    expect(undefinedTokens).toEqual([]);
  });
});
