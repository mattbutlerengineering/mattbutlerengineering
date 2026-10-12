import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CAPTURES_DIR,
  JUDGE_STATUS_FILE,
  WORK_DIR,
  capturesDir,
  readManifests,
  workPath,
} from "../ui-quality/work-dir.mjs";

describe("work-dir layout", () => {
  it("owns the documented names", () => {
    expect(WORK_DIR).toBe(".ui-quality");
    expect(CAPTURES_DIR).toBe("captures");
    expect(JUDGE_STATUS_FILE).toBe("judge-status.json");
  });

  it("derives paths from the root", () => {
    expect(workPath("/r")).toBe("/r/.ui-quality");
    expect(workPath("/r", "plan.json")).toBe("/r/.ui-quality/plan.json");
    expect(capturesDir("/r")).toBe("/r/.ui-quality/captures");
    expect(capturesDir("/r", "marketing")).toBe("/r/.ui-quality/captures/marketing");
  });
});

describe("readManifests", () => {
  let root;
  const put = (app, text) => {
    mkdirSync(capturesDir(root, app), { recursive: true });
    writeFileSync(join(capturesDir(root, app), "manifest.jsonl"), text);
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "uiq-wd-"));
  });

  it("returns app -> rows, apps sorted, blank lines skipped", () => {
    put("zeta", '{"route":"a"}\n\n{"route":"b"}\n');
    put("alpha", '{"route":"c"}\n');
    const m = readManifests(root);
    expect(Object.keys(m)).toEqual(["alpha", "zeta"]);
    expect(m.zeta).toEqual([{ route: "a" }, { route: "b" }]);
  });

  it("returns {} when there are no manifests (no captures dir)", () => {
    expect(readManifests(root)).toEqual({});
  });

  it("returns {} when app dirs exist without a manifest.jsonl", () => {
    mkdirSync(capturesDir(root, "marketing"), { recursive: true });
    expect(readManifests(root)).toEqual({});
  });

  it("throws on zero manifests when required", () => {
    expect(() => readManifests(root, { required: true })).toThrow(
      /no capture manifest under \.ui-quality\/captures\//
    );
  });

  it("carries the file path on a parse error", () => {
    put("marketing", "{not json\n");
    expect(() => readManifests(root)).toThrow(/marketing\/manifest\.jsonl is unreadable/);
  });
});
