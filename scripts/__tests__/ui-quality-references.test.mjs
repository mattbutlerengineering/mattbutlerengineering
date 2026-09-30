import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LICENSE_ALLOWLIST,
  REFERENCES_FILE,
  referenceErrors,
  rubricReferences,
} from "../ui-quality/references.mjs";
import { CATEGORIES } from "../ui-quality/rubric.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const doc = JSON.parse(readFileSync(join(REPO, REFERENCES_FILE), "utf8"));
const rubric = JSON.parse(readFileSync(join(REPO, "docs/ui-quality/rubric.json"), "utf8"));

const FIELDS = [
  "id",
  "category",
  "file",
  "app",
  "license",
  "source",
  "captured_at",
  "viewport",
  "sha256",
];

// Brief decision 13: no screenshot of a proprietary product in this public repo.
// Cal.com is open source but AGPL-3.0 — outside the allowlist, so excluded too.
const EXCLUDED_APPS =
  /stripe|linear|vercel|notion|figma|airbnb|opentable|resy|shopify|apple|google|cal\.com/i;

/** PNG IHDR width/height (bytes 16..23, big-endian). */
function pngSize(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("committed OSS reference set", () => {
  const refs = doc.references;

  it("has at least 5 references", () => {
    expect(refs.length).toBeGreaterThanOrEqual(5);
  });

  it("records every provenance field on every reference", () => {
    for (const ref of refs) {
      for (const field of FIELDS) expect(ref, `${ref.id}.${field}`).toHaveProperty(field);
      expect(ref.source.url).toMatch(/^https:\/\//);
      expect(ref.source.repo).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
      expect(ref.source.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(Number.isNaN(Date.parse(ref.captured_at))).toBe(false);
      expect(ref.viewport).toBe("1280x720");
    }
  });

  it("points every `file` at a committed 1280×720 PNG whose sha256 matches", () => {
    for (const ref of refs) {
      const path = join(REPO, ref.file);
      expect(existsSync(path), ref.file).toBe(true);
      const bytes = readFileSync(path);
      expect(createHash("sha256").update(bytes).digest("hex"), ref.id).toBe(ref.sha256);
      expect(pngSize(bytes), ref.id).toEqual({ width: 1280, height: 720 });
    }
  });

  it("uses only permissive licenses and names no proprietary product", () => {
    for (const ref of refs) {
      expect(LICENSE_ALLOWLIST, ref.id).toContain(ref.license);
      expect(ref.app, ref.id).not.toMatch(EXCLUDED_APPS);
    }
  });

  it("covers every non-harness rubric category at least once", () => {
    const covered = new Set(refs.map((r) => r.category));
    for (const category of CATEGORIES.filter((c) => c !== "harness")) {
      expect(covered.has(category), category).toBe(true);
    }
    expect(covered.has("harness")).toBe(false);
  });

  it("validates clean", () => {
    expect(referenceErrors(doc, REPO)).toEqual([]);
  });

  it("mirrors its ids, in order, into rubric.json references[]", () => {
    expect(rubric.references.map((r) => r.id)).toEqual(refs.map((r) => r.id));
    expect(rubric.references).toEqual(rubricReferences(doc));
  });
});

describe("referenceErrors", () => {
  const good = () => JSON.parse(JSON.stringify(doc));

  it("rejects a license outside the allowlist", () => {
    const bad = good();
    bad.references[0].license = "AGPL-3.0";
    expect(referenceErrors(bad, REPO).join("\n")).toMatch(/license/);
  });

  it("rejects a sha256 that does not match the file", () => {
    const bad = good();
    bad.references[0].sha256 = "0".repeat(64);
    expect(referenceErrors(bad, REPO).join("\n")).toMatch(/sha256/);
  });

  it("rejects a missing field and a duplicate id", () => {
    const bad = good();
    delete bad.references[0].captured_at;
    bad.references[1].id = bad.references[0].id;
    const errors = referenceErrors(bad, REPO).join("\n");
    expect(errors).toMatch(/captured_at/);
    expect(errors).toMatch(/duplicate/);
  });

  it("rejects a set that leaves a category uncovered", () => {
    const bad = good();
    bad.references = bad.references.filter((r) => r.category !== "component-docs");
    expect(referenceErrors(bad, REPO).join("\n")).toMatch(/component-docs/);
  });
});
