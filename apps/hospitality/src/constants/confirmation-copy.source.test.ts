import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, it, expect } from "vitest";
import { CONFIRMATION_COPY } from "./confirmation-copy.js";

/**
 * SC4 guard: the acknowledgement sentence is a literal in exactly one non-test
 * source file, `constants/confirmation-copy.ts`, and appears there once (the
 * host caption composes it rather than retyping it). Every surface must read
 * `CONFIRMATION_COPY` instead of retyping the sentence.
 *
 * Resolved from `process.cwd()` (vitest runs from apps/hospitality), the
 * convention of `components/floor-plan/TableShape.test.tsx`.
 */
const SRC_ROOT = resolve(process.cwd(), "src");
const COPY_FILE = "constants/confirmation-copy.ts";

/** The apostrophe-free tail also catches a JSX `&apos;` retype of the sentence. */
const FRAGMENT = "on your reservation for the team";

function sourceFiles(): readonly string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf-8" })
    .map((file) => file.split(sep).join("/"))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(".test."))
    .sort();
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function filesContaining(needle: string): readonly string[] {
  return sourceFiles().filter((file) =>
    readFileSync(join(SRC_ROOT, file), "utf-8").includes(needle)
  );
}

describe("SC4 guard: the acknowledgement is written once", () => {
  it("the fragment guard still matches the acknowledgement", () => {
    expect(CONFIRMATION_COPY.acknowledgement).toContain(FRAGMENT);
  });

  it("only confirmation-copy.ts contains the acknowledgement sentence", () => {
    const hits = filesContaining(CONFIRMATION_COPY.acknowledgement);
    expect(
      hits,
      `Read CONFIRMATION_COPY instead of retyping the sentence in:\n  ${hits.join("\n  ")}`
    ).toEqual([COPY_FILE]);
  });

  it("confirmation-copy.ts writes the sentence exactly once", () => {
    const text = readFileSync(join(SRC_ROOT, COPY_FILE), "utf-8");
    expect(countOccurrences(text, CONFIRMATION_COPY.acknowledgement)).toBe(1);
  });

  it("only confirmation-copy.ts contains the apostrophe-free fragment", () => {
    const hits = filesContaining(FRAGMENT);
    expect(
      hits,
      `Read CONFIRMATION_COPY instead of retyping the sentence in:\n  ${hits.join("\n  ")}`
    ).toEqual([COPY_FILE]);
  });
});
