import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractZipEntries } from "../extract-zip-entries.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures", "junit-artifact.zip");

describe("extractZipEntries", () => {
  it("extracts every file entry (skipping directory entries) with correct names", () => {
    const buf = readFileSync(FIXTURE);
    const entries = extractZipEntries(buf);
    const names = entries.map((e) => e.name).sort();
    expect(names).toEqual([
      "packages/bar/test-results/junit.xml",
      "services/foo/test-results/junit.xml",
    ]);
  });

  it("decompresses entry data back to the original file bytes", () => {
    const buf = readFileSync(FIXTURE);
    const entries = extractZipEntries(buf);
    const original = readFileSync(resolve(__dirname, "fixtures", "junit-sample.xml"));
    for (const entry of entries) {
      expect(entry.data.equals(original)).toBe(true);
    }
  });

  it("throws a clear error for a buffer that isn't a valid zip", () => {
    expect(() => extractZipEntries(Buffer.from("not a zip"))).toThrow(/zip/i);
  });
});
