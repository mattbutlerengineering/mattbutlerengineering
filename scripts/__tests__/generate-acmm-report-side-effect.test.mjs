import { describe, it, expect } from "vitest";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(
  __dirname,
  "..",
  "..",
  "apps",
  "marketing",
  "public",
  "acmm-report.json"
);

describe("generate-acmm-report.mjs", () => {
  it("does not write acmm-report.json as an import side effect", async () => {
    const existedBefore = existsSync(OUTPUT_PATH);
    const mtimeBefore = existedBefore ? statSync(OUTPUT_PATH).mtimeMs : null;

    await import("../generate-acmm-report.mjs");

    const existedAfter = existsSync(OUTPUT_PATH);
    const mtimeAfter = existedAfter ? statSync(OUTPUT_PATH).mtimeMs : null;

    expect(existedAfter).toBe(existedBefore);
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
