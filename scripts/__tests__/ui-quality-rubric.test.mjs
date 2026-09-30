import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  categoryOf,
  hashTells,
  loadRubric,
  main,
  tellsById,
  validateRubric,
} from "../ui-quality/rubric.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = JSON.parse(readFileSync(join(REPO, "docs/ui-quality/rubric.json"), "utf8"));
const md = readFileSync(join(REPO, "docs/ui-quality/rubric.md"), "utf8");

const clone = (value) => JSON.parse(JSON.stringify(value));

describe("committed rubric v1", () => {
  it("is version 1 and validates clean", () => {
    expect(json.rubric_version).toBe(1);
    expect(validateRubric(json)).toEqual([]);
    expect(loadRubric(REPO).rubric_version).toBe(1);
  });

  it("has one `### <tell-id>` heading in rubric.md per tell in rubric.json, and no others", () => {
    const headings = [...md.matchAll(/^### (\S+)\s*$/gm)].map((m) => m[1]).sort();
    expect(headings).toEqual(json.tells.map((t) => t.id).sort());
  });

  it("pins tells_hash to sha256 of the sorted `id|detection|default_severity` lines", () => {
    const expected = createHash("sha256")
      .update(
        json.tells
          .map((t) => `${t.id}|${t.detection}|${t.default_severity}`)
          .sort()
          .join("\n")
      )
      .digest("hex");
    expect(json.tells_hash).toBe(expected);
    expect(hashTells(json.tells)).toBe(expected);
  });

  it("carries the seven community tells, the three CHI EA '26 faults, the four bug tells and the four axe impacts", () => {
    const ids = json.tells.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "agent-built/unrequested-dark-theme",
        "agent-built/gradient-background",
        "agent-built/icon-card-grid",
        "agent-built/inter-headline",
        "agent-built/gray-card-border",
        "agent-built/three-feature-card-row",
        "agent-built/generic-hero-copy",
        "accessibility/non-descriptive-alt",
        "accessibility/vague-link-purpose",
        "accessibility/heading-content-mismatch",
        "bugs/blank-render",
        "bugs/unhandled-error",
        "bugs/dead-in-app-link",
        "bugs/failed-request",
        "accessibility/axe-critical",
        "accessibility/axe-serious",
        "accessibility/axe-moderate",
        "accessibility/axe-minor",
      ])
    );
    expect(ids).toHaveLength(18);
  });

  it("makes P1 mechanical only (architecture: a judged P1 would put a 7-day SLA on a guess)", () => {
    const p1 = json.tells.filter((t) => t.default_severity === "P1");
    expect(p1.every((t) => t.detection === "mechanical")).toBe(true);
    expect(p1.map((t) => t.id).sort()).toEqual([
      "accessibility/axe-critical",
      "bugs/blank-render",
      "bugs/dead-in-app-link",
      "bugs/unhandled-error",
    ]);
  });

  it("pins the calibration pass mark literal", () => {
    expect(json.calibration.pass_mark).toEqual({ agreement: 0.8, inversions: 0 });
  });

  it("carries the M3 reference set at v1 (contents pinned by ui-quality-references.test.mjs)", () => {
    expect(json.references.length).toBeGreaterThanOrEqual(5);
  });

  it("categorises visual-test as harness, and every app route to a category", () => {
    expect(categoryOf(json, "rialto-web", "visual-test")).toBe("harness");
    expect(categoryOf(json, "marketing", "/")).toBe("marketing-site");
    expect(categoryOf(json, "hospitality", "book/:venueSlug")).toBe("booking-checkout");
    expect(categoryOf(json, "hospitality", "timeline")).toBe("product-dashboard");
    expect(categoryOf(json, "rialto-web", "/components/button")).toBe("component-docs");
  });

  it("indexes tells by id", () => {
    expect(tellsById(json).get("bugs/blank-render").detection).toBe("mechanical");
  });
});

describe("validateRubric (the tells-hash guard)", () => {
  it("fails when a tell is edited without the hash changing", () => {
    const edited = clone(json);
    edited.tells.find((t) => t.id === "bugs/failed-request").default_severity = "P1";
    expect(validateRubric(edited)).toEqual(
      expect.arrayContaining([expect.stringMatching(/tells_hash/)])
    );
  });

  it("fails when a tell is added without the hash changing", () => {
    const edited = clone(json);
    edited.tells.push({
      id: "agent-built/new-tell",
      face: "agent-built",
      detection: "judged",
      default_severity: "P2",
    });
    expect(validateRubric(edited).some((e) => /tells_hash/.test(e))).toBe(true);
  });

  it("rejects an unknown face, detection or severity, and a duplicate id", () => {
    const edited = clone(json);
    edited.tells[0].face = "vibes";
    edited.tells[1].detection = "guessed";
    edited.tells[2].default_severity = "P0";
    edited.tells.push(clone(edited.tells[3]));
    edited.tells_hash = hashTells(edited.tells);
    const errors = validateRubric(edited).join("\n");
    expect(errors).toMatch(/face/);
    expect(errors).toMatch(/detection/);
    expect(errors).toMatch(/default_severity/);
    expect(errors).toMatch(/duplicate/);
  });

  it("rejects a judged P1", () => {
    const edited = clone(json);
    edited.tells.find((t) => t.id === "agent-built/gradient-background").default_severity = "P1";
    edited.tells_hash = hashTells(edited.tells);
    expect(validateRubric(edited).some((e) => /judged.*P1|P1.*judged/.test(e))).toBe(true);
  });

  it("rejects a non-integer rubric_version", () => {
    expect(validateRubric({ ...clone(json), rubric_version: "1" }).length).toBeGreaterThan(0);
  });
});

describe("rubric.mjs CLI", () => {
  const capture = () => {
    const out = [];
    return { out, io: { stdout: (s) => out.push(s), stderr: (s) => out.push(s) } };
  };

  it("check exits 0 on the committed rubric", () => {
    const { out, io } = capture();
    expect(main(["check"], { root: REPO, ...io })).toBe(0);
    expect(out.join("")).toMatch(/PASS/);
  });

  it("hash prints the committed tells_hash", () => {
    const { out, io } = capture();
    expect(main(["hash"], { root: REPO, ...io })).toBe(0);
    expect(out.join("").trim()).toBe(json.tells_hash);
  });

  it("bare invocation prints usage and exits 2", () => {
    const { out, io } = capture();
    expect(main([], { root: REPO, ...io })).toBe(2);
    expect(out.join("")).toMatch(/check\|hash/);
  });
});
