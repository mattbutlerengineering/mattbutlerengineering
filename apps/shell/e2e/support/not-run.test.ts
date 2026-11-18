import { describe, it, expect } from "vitest";
import { NOT_RUN_ANNOTATION, notRunReason, summarize, type SummaryInput } from "./not-run.js";

const t = (
  title: string,
  status: SummaryInput["status"],
  annotations: SummaryInput["annotations"] = []
): SummaryInput => ({ title, status, annotations });

describe("notRunReason", () => {
  it("reads the reason from a NOT RUN annotation", () => {
    expect(notRunReason([{ type: NOT_RUN_ANNOTATION, description: "no creds" }])).toBe("no creds");
  });
  it("is null without the annotation", () => {
    expect(notRunReason([{ type: "other", description: "x" }])).toBeNull();
  });
  it("has a fallback reason when the description is empty", () => {
    expect(notRunReason([{ type: NOT_RUN_ANNOTATION }])).toMatch(/no reason/i);
  });
});

describe("summarize", () => {
  it("counts a skipped test with a NOT RUN annotation as NOT RUN, never as pass", () => {
    const s = summarize([
      t("check 1 a", "passed"),
      t("check 6 b", "skipped", [{ type: NOT_RUN_ANNOTATION, description: "no creds" }]),
    ]);
    expect(s.passed).toBe(1);
    expect(s.notRun).toEqual([{ title: "check 6 b", reason: "no creds" }]);
  });

  it("counts a skipped test WITHOUT an annotation as unexplained skip, not pass and not NOT RUN", () => {
    const s = summarize([t("check 2 x", "skipped")]);
    expect(s.passed).toBe(0);
    expect(s.notRun).toEqual([]);
    expect(s.unexplainedSkips).toEqual(["check 2 x"]);
  });

  it("counts failures, timeouts and interruptions as failed", () => {
    const s = summarize([
      t("a", "failed"),
      t("b", "timedOut"),
      t("c", "interrupted"),
      t("d", "passed"),
    ]);
    expect(s.failed).toBe(3);
    expect(s.passed).toBe(1);
  });

  it("does not report a pass for a test that carries NOT RUN yet passed", () => {
    const s = summarize([t("e", "passed", [{ type: NOT_RUN_ANNOTATION, description: "r" }])]);
    expect(s.passed).toBe(0);
    expect(s.notRun).toEqual([{ title: "e", reason: "r" }]);
  });
});
