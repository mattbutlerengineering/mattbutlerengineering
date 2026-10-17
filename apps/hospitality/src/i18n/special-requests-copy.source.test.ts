import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, it, expect } from "vitest";
import enUS from "./catalogs/en-US.json";

/**
 * SC4 guard: the guest acknowledgement sentence is a literal in exactly one
 * non-test source file, the en-US catalog (`bookingWidget.specialRequests.acknowledgement`),
 * and appears there once. The host caption quotes it by reference
 * (`$t(bookingWidget.specialRequests.acknowledgement)`) rather than retyping it,
 * and every surface reads it through `t()`.
 *
 * Scans `.json` as well as `.ts`/`.tsx`, so a retype into another catalog or
 * any JSON under `src/` is caught too.
 *
 * Resolved from `process.cwd()` (vitest runs from apps/hospitality), the
 * convention of `components/floor-plan/TableShape.test.tsx`.
 */
const SRC_ROOT = resolve(process.cwd(), "src");
const COPY_FILE = "i18n/catalogs/en-US.json";
const ACKNOWLEDGEMENT = enUS.bookingWidget.specialRequests.acknowledgement;

/** The apostrophe-free tail also catches a JSX `&apos;` retype of the sentence. */
const FRAGMENT = "on your reservation for the team";

function sourceFiles(): readonly string[] {
  return readdirSync(SRC_ROOT, { recursive: true, encoding: "utf-8" })
    .map((file) => file.split(sep).join("/"))
    .filter((file) => /\.(ts|tsx|json)$/.test(file) && !file.includes(".test."))
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
    expect(ACKNOWLEDGEMENT).toContain(FRAGMENT);
  });

  it("only the en-US catalog contains the acknowledgement sentence", () => {
    const hits = filesContaining(ACKNOWLEDGEMENT);
    expect(
      hits,
      `Read t("bookingWidget.specialRequests.acknowledgement") instead of retyping the sentence in:\n  ${hits.join("\n  ")}`
    ).toEqual([COPY_FILE]);
  });

  it("the en-US catalog writes the sentence exactly once", () => {
    const text = readFileSync(join(SRC_ROOT, COPY_FILE), "utf-8");
    expect(countOccurrences(text, ACKNOWLEDGEMENT)).toBe(1);
  });

  it("only the en-US catalog contains the apostrophe-free fragment", () => {
    const hits = filesContaining(FRAGMENT);
    expect(
      hits,
      `Read t("bookingWidget.specialRequests.acknowledgement") instead of retyping the sentence in:\n  ${hits.join("\n  ")}`
    ).toEqual([COPY_FILE]);
  });
});
