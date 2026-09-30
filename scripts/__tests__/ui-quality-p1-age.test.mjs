import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { breachedIssues, main } from "../ui-quality/p1-age.mjs";
import { main as findingsMain } from "../ui-quality/findings.mjs";

const NOW = "2026-10-10T07:40:00Z";
const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.parse(NOW) - days * DAY).toISOString();
const ESCALATIONS = ".ui-quality/p1-escalations.json";
const LEDGER = "metrics/ui-quality-findings.json";

let root;

function writeJson(rel, value) {
  const path = join(root, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function run(issues, extra = []) {
  const out = [];
  const code = main(
    ["--issues", writeJson("in/issues.json", issues), "--now", NOW, ...extra, "--root", root],
    { stdout: (s) => out.push(s), stderr: () => {} }
  );
  const path = join(root, ESCALATIONS);
  return {
    code,
    out: out.join(""),
    escalations: existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ui-quality-p1-age-"));
  mkdirSync(join(root, "metrics"));
});

describe("breachedIssues", () => {
  it("reads createdAt (gh) or created_at (MCP), oldest first", () => {
    const issues = [
      { number: 1, title: "a", createdAt: ago(8) },
      { number: 2, title: "b", created_at: ago(9) },
      { number: 3, title: "c", created_at: ago(1) },
    ];
    expect(breachedIssues(issues, Date.parse(NOW)).map((b) => b.number)).toEqual([2, 1]);
  });
});

describe("p1-age.mjs", () => {
  it("an 8-day-old P1 exits 1 and is listed", () => {
    const { code, out } = run([{ number: 5901, title: "ui-quality: x", createdAt: ago(8) }]);
    expect(code).toBe(1);
    expect(out).toContain("#5901");
    expect(out).toContain("8 days");
  });

  it("a 6-day-old P1 exits 0", () => {
    const { code, out } = run([{ number: 5901, title: "ui-quality: x", createdAt: ago(6) }]);
    expect(code).toBe(0);
    expect(out).not.toContain("#5901");
  });

  it("an issue without createdAt counts as breached", () => {
    const { code, out } = run([{ number: 5902, title: "ui-quality: y" }]);
    expect(code).toBe(1);
    expect(out).toContain("#5902");
  });

  it("accepts an MCP search result wrapped in items", () => {
    expect(run({ items: [{ number: 7, title: "t", created_at: ago(30) }] }).code).toBe(1);
  });

  it("--escalate emits the needs-review label and one comment per breach", () => {
    const { escalations } = run([{ number: 5901, title: "x", createdAt: ago(8) }], ["--escalate"]);
    expect(escalations.actions).toEqual([
      { issue: 5901, action: "label", labels: ["needs-review"] },
      { issue: 5901, action: "comment", body: expect.stringContaining("8 days") },
    ]);
  });

  it("a second --escalate on an already-escalated key emits nothing", () => {
    writeJson(LEDGER, {
      "marketing|/|r1|bugs/dead-in-app-link": {
        issue: 5901,
        carrier: "issue",
        state: "open",
        severity: "P1",
        first_seen: "2026-10-01",
        last_seen: "2026-10-01",
        escalated_at: "2026-10-09T07:40:00Z",
      },
    });
    const { code, escalations } = run(
      [{ number: 5901, title: "x", createdAt: ago(8) }],
      ["--escalate"]
    );
    expect(code).toBe(1);
    expect(escalations.actions).toEqual([]);
  });

  it("findings.mjs record stamps escalated_at, so the next --escalate is empty", () => {
    const key = "marketing|/|r1|bugs/dead-in-app-link";
    writeJson(LEDGER, {
      [key]: {
        issue: 5901,
        carrier: "issue",
        state: "open",
        severity: "P1",
        first_seen: "2026-10-01",
        last_seen: "2026-10-01",
        escalated_at: null,
      },
    });
    const issues = [{ number: 5901, title: "x", createdAt: ago(8) }];
    expect(run(issues, ["--escalate"]).escalations.actions).toHaveLength(2);
    const executed = writeJson("in/executed.json", { actions: [], escalated: [5901] });
    const code = findingsMain(["record", "--executed", executed, "--now", NOW, "--root", root], {
      stderr: () => {},
    });
    expect(code).toBe(0);
    const ledger = JSON.parse(readFileSync(join(root, LEDGER), "utf8"));
    expect(ledger[key].escalated_at).toBe(NOW);
    expect(ledger[key].last_seen).toBe("2026-10-01");
    expect(run(issues, ["--escalate"]).escalations.actions).toEqual([]);
  });
});
