import { describe, expect, it } from "vitest";
import { capLog } from "../cap-improvement-log.mjs";

const LOG = "# preamble\n\n## 2026-01-01\na\n\n## 2026-01-02\nb\n\n## 2026-01-03\nc\n";

describe("capLog", () => {
  it("keeps only the newest N dated sections", () => {
    const out = capLog(LOG, 2);
    expect(out).not.toContain("2026-01-01");
    expect(out).toContain("## 2026-01-02\nb");
    expect(out).toContain("## 2026-01-03\nc");
  });

  it("keeps the preamble before the first section", () => {
    expect(capLog(LOG, 1)).toMatch(/^# preamble/);
  });

  it("returns the text unchanged when under the cap", () => {
    expect(capLog(LOG, 10)).toBe(LOG);
  });
});
