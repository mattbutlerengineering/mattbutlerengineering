import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { APPS, appPaths, PROVENANCE_FIELDS } from "../visual-noise-floor.mjs";
import {
  TARGETS,
  planBaselineRegen,
  summarizeSnapshotChanges,
  renderPrBody,
} from "../visual-baseline-regen.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const CLI = resolve(ROOT, "scripts/visual-baseline-regen.mjs");
const SOURCE = readFileSync(CLI, "utf8");

describe("planBaselineRegen", () => {
  it.each(APPS)("%s matches appPaths()", (app) => {
    const plan = planBaselineRegen({ app });
    const p = appPaths(app);
    expect(plan.config).toBe(p.config);
    expect(plan.spec).toBe(p.spec);
    expect(plan.screenshots).toBe(p.screenshots);
    expect(plan.branch).toBe(`automation/visual-baseline-regen/${app}`);
    expect(plan.addPaths).toBe(`${p.screenshots}/*.png`);
    expect(plan.labels).toEqual(["needs-review"]);
  });

  it("plans the rialto Storybook suite from its own dir", () => {
    const plan = planBaselineRegen({ app: "rialto" });
    expect(plan.config).toBe("packages/rialto/playwright.visual.config.ts");
    expect(plan.spec).toBe("packages/rialto/src/test/visual/visual.spec.ts");
    expect(plan.screenshots).toBe("packages/rialto/src/test/visual/__screenshots__");
    expect(plan.packageJson).toBe("packages/rialto/package.json");
    expect(plan.addPaths).toBe("packages/rialto/src/test/visual/__screenshots__/*.png");
    expect(plan.branch).toBe("automation/visual-baseline-regen/rialto");
    expect(plan.captureArgs).toContain("--update-snapshots");
    expect(plan.verifyArgs).not.toContain("--update-snapshots");
  });

  it("exposes every app as a target", () => {
    for (const app of APPS) expect(Object.keys(TARGETS)).toContain(app);
  });

  it("throws on an unknown app", () => {
    expect(() => planBaselineRegen({ app: "nope" })).toThrow(/rialto-web/);
  });

  it("only captureArgs carries --update-snapshots", () => {
    const plan = planBaselineRegen({ app: "marketing" });
    expect(plan.captureArgs).toContain("--update-snapshots");
    expect(plan.verifyArgs).not.toContain("--update-snapshots");
  });

  it("passes grep once in each argv as one element", () => {
    const grep = "metrics (1280|390)";
    const plan = planBaselineRegen({ app: "marketing", grep });
    for (const argv of [plan.captureArgs, plan.verifyArgs]) {
      expect(argv.filter((a) => a === grep)).toHaveLength(1);
      expect(argv[argv.indexOf(grep) - 1]).toBe("-g");
    }
  });

  it("omits -g without grep", () => {
    const plan = planBaselineRegen({ app: "marketing" });
    expect(plan.captureArgs).not.toContain("-g");
    expect(plan.verifyArgs).not.toContain("-g");
  });

  it("only mentions auto-merge in the never-auto-merge sentence, never as a label", () => {
    const hits = SOURCE.split("\n").filter((l) => /auto-merge/i.test(l));
    expect(hits.every((l) => /never auto-merge/i.test(l))).toBe(true);
    expect(planBaselineRegen({ app: "marketing" }).labels).not.toContain("auto-merge");
  });
});

describe("summarizeSnapshotChanges", () => {
  const dir = "apps/marketing/e2e/screenshots";
  it("returns empty buckets for empty input", () => {
    expect(summarizeSnapshotChanges("", dir)).toEqual({ added: [], modified: [], deleted: [] });
  });

  it("classifies and sorts, ignoring non-png and out-of-dir paths", () => {
    const text = [
      ` M ${dir}/b.png`,
      `M  ${dir}/a.png`,
      `?? ${dir}/new.png`,
      ` D ${dir}/gone.png`,
      `D  ${dir}/gone2.png`,
      ` M ${dir}/notes.txt`,
      ` M apps/marketing/src/x.ts`,
      ` M apps/other/e2e/screenshots/z.png`,
    ].join("\n");
    expect(summarizeSnapshotChanges(text, dir)).toEqual({
      added: [`${dir}/new.png`],
      modified: [`${dir}/a.png`, `${dir}/b.png`],
      deleted: [`${dir}/gone.png`, `${dir}/gone2.png`],
    });
  });
});

describe("renderPrBody", () => {
  const plan = planBaselineRegen({ app: "marketing" });
  const changes = {
    added: ["apps/marketing/e2e/screenshots/new.png"],
    modified: ["apps/marketing/e2e/screenshots/m.png"],
    deleted: ["apps/marketing/e2e/screenshots/old.png"],
  };
  const provenance = {
    imageOs: "ubuntu24",
    imageVersion: "20260810.271",
    playwrightVersion: "1.60.0",
    chromiumBuild: "1234",
  };
  const body = renderPrBody({
    plan,
    changes,
    provenance,
    verify: { passed: 3, total: 3 },
    runUrl: "https://github.com/x/y/actions/runs/1",
  });

  it("names every changed file", () => {
    for (const f of [...changes.added, ...changes.modified, ...changes.deleted]) {
      expect(body).toContain(f);
    }
  });

  it("carries the provenance tuple", () => {
    for (const f of PROVENANCE_FIELDS) expect(body).toContain(f);
    for (const v of Object.values(provenance)) expect(body).toContain(v);
  });

  it("reports verify, review, and never-auto-merge lines", () => {
    expect(body).toContain("3/3 snapshots pass in compare mode");
    expect(body).toContain("Files changed");
    expect(body).toMatch(/never auto-merge/i);
    expect(body).toContain("https://github.com/x/y/actions/runs/1");
  });
});

describe("CLI", () => {
  it("plan prints GITHUB_OUTPUT lines", () => {
    const out = execFileSync("node", [CLI, "plan", "--app", "marketing"], { encoding: "utf8" });
    const p = appPaths("marketing");
    expect(out).toContain(`config=${p.config}\n`);
    expect(out).toContain(`spec=${p.spec}\n`);
    expect(out).toContain(`screenshots=${p.screenshots}\n`);
    expect(out).toContain(`package_json=${p.packageJson}\n`);
    expect(out).toContain("branch=automation/visual-baseline-regen/marketing\n");
    expect(out).toMatch(/^capture_args=\[.*--update-snapshots.*\]$/m);
    expect(out).toMatch(/^verify_args=\[.*\]$/m);
  });

  it("plan --app nope exits non-zero naming the apps", () => {
    const r = spawnSync("node", [CLI, "plan", "--app", "nope"], { encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("rialto-web");
  });

  it("summarize reads porcelain from stdin", () => {
    const out = execFileSync("node", [CLI, "summarize", "--app", "marketing"], {
      encoding: "utf8",
      input:
        " M apps/marketing/e2e/screenshots/a.png\n?? apps/marketing/e2e/screenshots/n.png\n M apps/marketing/src/x.ts\n",
    });
    expect(JSON.parse(out)).toEqual({
      added: ["apps/marketing/e2e/screenshots/n.png"],
      modified: ["apps/marketing/e2e/screenshots/a.png"],
      deleted: [],
    });
  });
});
