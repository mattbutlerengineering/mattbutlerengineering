import { describe, it, expect } from "vitest";
import { LABELS, LABEL, bootstrapCommands, main } from "../ui-quality/labels.mjs";

describe("labels", () => {
  it("declares exactly ui-quality, ui-quality:p1 and ui-quality:p2", () => {
    expect(LABELS.map((l) => l.name)).toEqual(["ui-quality", "ui-quality:p1", "ui-quality:p2"]);
    for (const l of LABELS) {
      expect(l.color).toMatch(/^[0-9a-f]{6}$/);
      expect(l.description.length).toBeGreaterThan(0);
      expect(l.description.length).toBeLessThanOrEqual(100);
    }
    expect(LABEL).toEqual({ base: "ui-quality", p1: "ui-quality:p1", p2: "ui-quality:p2" });
  });

  it("print-bootstrap emits the three gh label create lines and executes nothing", () => {
    const out = [];
    const code = main(["print-bootstrap"], { stdout: (s) => out.push(s) });
    expect(code).toBe(0);
    expect(out.join("")).toBe(
      [
        'gh label create "ui-quality" --color 5319e7 --description "Found by the daily ui-quality routine" --force',
        'gh label create "ui-quality:p1" --color b60205 --description "ui-quality P1: fix within 7 days" --force',
        'gh label create "ui-quality:p2" --color fbca04 --description "ui-quality P2: filed within the per-fire budget" --force',
        "",
      ].join("\n")
    );
    expect(bootstrapCommands()).toHaveLength(3);
  });

  it("an unknown subcommand exits 2", () => {
    expect(main(["nope"], { stderr: () => {} })).toBe(2);
  });
});
