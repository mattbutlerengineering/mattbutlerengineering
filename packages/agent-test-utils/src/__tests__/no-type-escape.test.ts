import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Recursively lists .ts sources under `dir`, skipping __tests__ directories. */
function listSources(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : listSources(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/**
 * Fixtures that are cast past the type checker drift from the shapes
 * production emits (see #6502). Fixture sources must satisfy the real types.
 */
describe("fixture sources", () => {
  const files = listSources(SRC_DIR).map((f) => relative(SRC_DIR, f));

  it("finds fixture sources to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s does not use `as unknown as`", (file) => {
    const source = readFileSync(join(SRC_DIR, file), "utf8");
    expect(source).not.toMatch(/as\s+unknown\s+as/);
  });
});
