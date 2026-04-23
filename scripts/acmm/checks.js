/**
 * ACMM check implementations. Each is a pure async function of (cwd) → CheckResult.
 * Reads the file system + git. Never touches the network (keeps fixture testing clean).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {{ passed: boolean, evidence: string }} CheckResult
 * @typedef {(cwd: string) => Promise<CheckResult>} CheckRunner
 */

/* ── Helpers ─────────────────────────────────────────────── */

/** @returns {string | null} */
function readFileSafe(abs) {
  try { return readFileSync(abs, "utf-8"); } catch { return null; }
}

/** @returns {string[]} children of `dir` that are themselves directories (or []) */
function subdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch { return []; }
}

/** @returns {string[]} files directly under `dir` (no recursion). */
function filesIn(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch { return []; }
}

/** Count files matching a predicate under `root`, bailing early at `limit`. */
function countFiles(root, predicate, { limit = Infinity, maxDepth = 6 } = {}) {
  let found = 0;
  /** @param {string} dir @param {number} depth */
  function walk(dir, depth) {
    if (depth > maxDepth || found >= limit) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (found >= limit) return;
      if (e.name.startsWith(".") && e.name !== ".github" && e.name !== ".claude" && e.name !== ".husky") continue;
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".turbo" || e.name === ".next") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (predicate(p, e.name)) found += 1;
    }
  }
  walk(root, 0);
  return found;
}

/** Read a JSON file; return null on any failure. */
function readJsonSafe(abs) {
  const raw = readFileSafe(abs);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** @returns {number} commit count, or 0 on error */
function gitCommitCount(cwd) {
  try {
    // execFileSync — no shell, no injection surface, hardcoded args.
    const out = execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"],
    });
    return parseInt(out.trim(), 10) || 0;
  } catch { return 0; }
}

/* ── Check runners ──────────────────────────────────────── */

/** @type {Record<string, CheckRunner>} */
export const RUNNERS = {
  // ── L1 ────────────────────────────────────────────────
  "I1.1": async (cwd) => {
    const ok = existsSync(join(cwd, "README.md"));
    return { passed: ok, evidence: ok ? "README.md found" : "README.md missing" };
  },
  "I1.2": async (cwd) => {
    const candidates = ["CLAUDE.md", "AGENTS.md", ".cursorrules", ".windsurfrules"];
    const found = candidates.filter((f) => existsSync(join(cwd, f)));
    return { passed: found.length > 0, evidence: found.length ? `Found: ${found.join(", ")}` : "None of CLAUDE.md / AGENTS.md / .cursorrules / .windsurfrules" };
  },
  "M1.1": async (cwd) => {
    const count = countFiles(cwd, (_p, name) => /\.(test|spec)\.[jt]sx?$/.test(name), { limit: 1 });
    const hasTestsDir = existsSync(join(cwd, "tests")) || existsSync(join(cwd, "test"));
    const ok = count > 0 || hasTestsDir;
    return { passed: ok, evidence: ok ? (count > 0 ? "Found at least one *.test.* or *.spec.* file" : "tests/ directory found") : "No test files or tests/ directory" };
  },
  "F1.1": async (cwd) => {
    const n = gitCommitCount(cwd);
    return { passed: n >= 10, evidence: `${n} commits in HEAD` };
  },
  "G1.1": async (cwd) => {
    const ok = existsSync(join(cwd, ".gitignore"));
    return { passed: ok, evidence: ok ? ".gitignore found" : ".gitignore missing" };
  },

  // ── L2 ────────────────────────────────────────────────
  "I2.1": async (cwd) => {
    const body = readFileSafe(join(cwd, "CLAUDE.md"));
    if (!body) return { passed: false, evidence: "Root CLAUDE.md missing" };
    return { passed: body.length > 500, evidence: `Root CLAUDE.md is ${body.length} chars` };
  },
  "I2.2": async (cwd) => {
    const body = readFileSafe(join(cwd, "README.md")) || "";
    const mentions = /\b(agents?|AI workflow|CLAUDE\.md|AGENTS\.md|automation|autonomous)\b/i.test(body);
    return { passed: mentions, evidence: mentions ? "README references AI/agent workflow" : "README does not mention AI/agents" };
  },
  "M2.1": async (cwd) => {
    const pkg = readJsonSafe(join(cwd, "package.json"));
    if (!pkg?.scripts) return { passed: false, evidence: "No package.json scripts" };
    const required = ["test", "typecheck", "lint"];
    const present = required.filter((s) => typeof pkg.scripts[s] === "string");
    const missing = required.filter((r) => !present.includes(r));
    return { passed: present.length === required.length, evidence: `Scripts present: ${present.join(", ") || "(none)"}` + (missing.length ? `; missing: ${missing.join(", ")}` : "") };
  },
  "F2.1": async (cwd) => {
    const gha = existsSync(join(cwd, ".github", "workflows"));
    const husky = existsSync(join(cwd, ".husky"));
    const lefthook = existsSync(join(cwd, ".lefthook.yml")) || existsSync(join(cwd, "lefthook.yml"));
    const precommitYaml = existsSync(join(cwd, ".pre-commit-config.yaml"));
    const ok = gha || husky || lefthook || precommitYaml;
    const sources = [gha && ".github/workflows/", husky && ".husky/", lefthook && "lefthook", precommitYaml && ".pre-commit-config.yaml"].filter(Boolean);
    return { passed: ok, evidence: ok ? `CI/hook source: ${sources.join(", ")}` : "No CI workflows or pre-commit hook config" };
  },
  "G2.1": async (cwd) => {
    const candidates = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", ".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yaml", ".eslintrc.yml", "biome.json", "ruff.toml", ".ruff.toml"];
    const found = candidates.filter((f) => existsSync(join(cwd, f)));
    return { passed: found.length > 0, evidence: found.length ? `Linter config: ${found.join(", ")}` : "No linter config" };
  },
  "G2.2": async (cwd) => {
    const husky = existsSync(join(cwd, ".husky", "pre-commit"));
    const lefthook = (readFileSafe(join(cwd, ".lefthook.yml")) || readFileSafe(join(cwd, "lefthook.yml")) || "").includes("pre-commit");
    const precommitYaml = existsSync(join(cwd, ".pre-commit-config.yaml"));
    const ok = husky || lefthook || precommitYaml;
    return { passed: ok, evidence: ok ? [husky && ".husky/pre-commit", lefthook && "lefthook pre-commit", precommitYaml && ".pre-commit-config.yaml"].filter(Boolean).join(", ") : "No pre-commit hook wired" };
  },

  // ── L3 ────────────────────────────────────────────────
  "I3.1": async (cwd) => {
    const roots = ["packages", "services", "apps"].map((r) => join(cwd, r)).filter(existsSync);
    let count = 0;
    const found = [];
    for (const r of roots) {
      for (const sub of subdirs(r)) {
        if (existsSync(join(r, sub, "CLAUDE.md"))) {
          count += 1;
          found.push(`${r.replace(cwd + "/", "")}/${sub}`);
        }
      }
    }
    return { passed: count >= 3, evidence: count >= 3 ? `${count} scoped CLAUDE.md files found` : `Only ${count} scoped CLAUDE.md files (need ≥3)` + (found.length ? `. Found: ${found.join(", ")}` : "") };
  },
  "I3.2": async (cwd) => {
    for (const dir of ["docs/adr", "docs/decisions", "docs/architecture/decisions"]) {
      const abs = join(cwd, dir);
      if (!existsSync(abs)) continue;
      const md = countFiles(abs, (_p, name) => name.endsWith(".md"), { limit: 1, maxDepth: 2 });
      if (md > 0) return { passed: true, evidence: `ADR directory with entries: ${dir}` };
    }
    return { passed: false, evidence: "No ADR directory (docs/adr/ or docs/decisions/) with at least one .md" };
  },
  "I3.3": async (cwd) => {
    const skillCount = subdirs(join(cwd, ".claude", "skills")).length;
    const agentDirs = subdirs(join(cwd, ".claude", "agents")).length;
    const agentFiles = filesIn(join(cwd, ".claude", "agents")).filter((f) => f.endsWith(".md")).length;
    const total = skillCount + agentDirs + agentFiles;
    return { passed: total >= 3, evidence: `${skillCount} skills + ${agentDirs + agentFiles} agents in .claude/` };
  },
  "M3.1": async (cwd) => {
    const pkg = readJsonSafe(join(cwd, "package.json"));
    const s = pkg?.scripts || {};
    const ok = typeof s.lint === "string" && typeof s.typecheck === "string" && typeof s.test === "string";
    return { passed: ok, evidence: ok ? "Separate lint/typecheck/test scripts in package.json" : "Missing: " + ["lint", "typecheck", "test"].filter((k) => !s[k]).join(", ") };
  },
  "F3.1": async (cwd) => {
    const body = readFileSafe(join(cwd, ".husky", "pre-commit"))
      ?? readFileSafe(join(cwd, ".lefthook.yml"))
      ?? readFileSafe(join(cwd, "lefthook.yml"))
      ?? readFileSafe(join(cwd, ".pre-commit-config.yaml"))
      ?? "";
    const signals = ["lint", "typecheck", "test", "check-"].filter((s) => body.includes(s));
    return { passed: signals.length >= 2, evidence: signals.length ? `Pre-commit references: ${signals.join(", ")}` : "Pre-commit hook references none of lint/typecheck/test/check-" };
  },
  "F3.2": async (cwd) => {
    const ok = existsSync(join(cwd, ".github", "PULL_REQUEST_TEMPLATE.md")) ||
      existsSync(join(cwd, ".github", "pull_request_template.md")) ||
      existsSync(join(cwd, "PULL_REQUEST_TEMPLATE.md"));
    return { passed: ok, evidence: ok ? "PR template present" : "No PULL_REQUEST_TEMPLATE.md" };
  },
  "G3.1": async (cwd) => {
    const ok = existsSync(join(cwd, ".github", "CODEOWNERS")) ||
      existsSync(join(cwd, "CODEOWNERS")) ||
      existsSync(join(cwd, "docs", "CODEOWNERS"));
    return { passed: ok, evidence: ok ? "CODEOWNERS present" : "No CODEOWNERS file" };
  },
  "G3.2": async (cwd) => {
    const scriptsDir = join(cwd, "scripts");
    const scripts = existsSync(scriptsDir)
      ? readdirSync(scriptsDir).filter((f) => /check-adr/i.test(f))
      : [];
    const rootPkg = readJsonSafe(join(cwd, "package.json")) ?? {};
    const precommit = readFileSafe(join(cwd, ".husky", "pre-commit")) ?? "";
    const referencedAdrCheck = /check-adr/i.test(precommit) || Object.values(rootPkg.scripts ?? {}).some((v) => /check-adr/i.test(String(v)));
    const ok = scripts.length > 0 || referencedAdrCheck;
    return { passed: ok, evidence: ok ? (scripts.length ? `scripts/${scripts.join(", ")}` : "ADR check referenced in package.json or pre-commit") : "No ADR enforcement script found" };
  },

  // ── L4 ────────────────────────────────────────────────
  "I4.1": async (cwd) => {
    const candidates = ["llms.txt", "llms-full.txt", "AGENTS.md", "docs/llms.txt"];
    const found = candidates.filter((f) => existsSync(join(cwd, f)));
    return { passed: found.length > 0, evidence: found.length ? `AI reference index: ${found.join(", ")}` : "No llms.txt / llms-full.txt / AGENTS.md index" };
  },
  "I4.2": async (cwd) => {
    const skillCount = subdirs(join(cwd, ".claude", "skills")).length;
    const agentDirs = subdirs(join(cwd, ".claude", "agents")).length;
    const agentFiles = filesIn(join(cwd, ".claude", "agents")).filter((f) => f.endsWith(".md")).length;
    const total = skillCount + agentDirs + agentFiles;
    return { passed: total >= 5, evidence: `${skillCount} skills + ${agentDirs + agentFiles} agents (need ≥5 total)` };
  },
  "M4.1": async (cwd) => {
    const hasSkill = existsSync(join(cwd, ".claude", "skills", "progress-tracker", "SKILL.md"));
    const workflows = join(cwd, ".github", "workflows");
    let scheduled = false;
    if (existsSync(workflows)) {
      for (const f of readdirSync(workflows)) {
        const body = readFileSafe(join(workflows, f)) ?? "";
        if (/^\s*schedule:\s*$/m.test(body) || /cron:/.test(body)) { scheduled = true; break; }
      }
    }
    const ok = hasSkill || scheduled;
    return { passed: ok, evidence: ok ? (hasSkill ? "progress-tracker skill present" : "scheduled workflow with cron found") : "No scheduled metrics skill or cron workflow" };
  },
  "M4.2": async (cwd) => {
    const candidates = [".claude/improvement-loop/log.md", ".claude/metrics/log.md", "metrics/log.md", ".audit-state/history.json"];
    const found = candidates.find((f) => existsSync(join(cwd, f)));
    return { passed: Boolean(found), evidence: found ? `Metrics log: ${found}` : "No persistent metrics log" };
  },
  "M4.3": async (cwd) => {
    // Accept the log itself (may be gitignored, written at runtime) OR a
    // spend-tracking script that materializes one. Both signal the
    // capability is present — which is what L4 is asking about.
    const logCandidates = [".claude/agent-spend.jsonl", ".claude/cost.jsonl", ".claude/spend.log"];
    const scriptCandidates = ["scripts/log-agent-cost.js", "scripts/log-agent-cost.mjs", "scripts/track-agent-spend.js"];
    const foundLog = logCandidates.find((f) => existsSync(join(cwd, f)));
    const foundScript = scriptCandidates.find((f) => existsSync(join(cwd, f)));
    if (foundLog) return { passed: true, evidence: `Agent spend log: ${foundLog}` };
    if (foundScript) return { passed: true, evidence: `Spend-tracking script: ${foundScript} (log materializes at runtime)` };
    return { passed: false, evidence: "No agent spend tracking log or script" };
  },
  "F4.1": async (cwd) => {
    const ok = existsSync(join(cwd, ".claude", "skills", "issue-worker", "SKILL.md")) ||
      existsSync(join(cwd, ".claude", "skills", "ship-loop", "SKILL.md"));
    return { passed: ok, evidence: ok ? "issue-worker or ship-loop skill present" : "No issue→PR loop skill" };
  },
  "F4.2": async (cwd) => {
    const workflows = join(cwd, ".github", "workflows");
    let cron = false;
    if (existsSync(workflows)) {
      for (const f of readdirSync(workflows)) {
        if ((readFileSafe(join(workflows, f)) ?? "").match(/cron:|schedule:/)) { cron = true; break; }
      }
    }
    const claudeMd = readFileSafe(join(cwd, "CLAUDE.md")) ?? "";
    const remoteTrigger = /RemoteTrigger|mbe-\w+-(audit|worker|tracker)/i.test(claudeMd);
    const ok = cron || remoteTrigger;
    return { passed: ok, evidence: ok ? [cron && "workflow cron", remoteTrigger && "RemoteTrigger documented in CLAUDE.md"].filter(Boolean).join(", ") : "No scheduled audit infra" };
  },
  "G4.1": async (cwd) => {
    const scriptsDir = join(cwd, "scripts");
    const scripts = existsSync(scriptsDir)
      ? readdirSync(scriptsDir).filter((f) => /check-destructive|check-drop|migration-safety/i.test(f))
      : [];
    return { passed: scripts.length > 0, evidence: scripts.length ? `scripts/${scripts.join(", ")}` : "No destructive-op check script" };
  },
  "G4.2": async (cwd) => {
    const precommit = readFileSafe(join(cwd, ".husky", "pre-commit")) ?? "";
    const workflows = join(cwd, ".github", "workflows");
    let ciRefs = false;
    if (existsSync(workflows)) {
      for (const f of readdirSync(workflows)) {
        if (/check-adr/i.test(readFileSafe(join(workflows, f)) ?? "")) { ciRefs = true; break; }
      }
    }
    const precommitRefs = /check-adr/i.test(precommit);
    const ok = precommitRefs && ciRefs;
    return { passed: ok, evidence: ok ? "ADR check in pre-commit AND CI" : `ADR check — pre-commit:${precommitRefs} CI:${ciRefs}` };
  },

  // ── L5 ────────────────────────────────────────────────
  "I5.1": async (cwd) => {
    const body = readFileSafe(join(cwd, "CLAUDE.md")) ?? "";
    const hasLoop = /\b(ship[- ]loop|agent loop|continuous improvement loop|improvement loop)\b/i.test(body);
    const hasLabelMachine = /(ready|in-progress|has-pr).*?(ready|in-progress|has-pr)/is.test(body);
    const ok = hasLoop && hasLabelMachine;
    return { passed: ok, evidence: ok ? "Root CLAUDE.md documents the agent/ship loop + label machine" : `CLAUDE.md lacks: ${[!hasLoop && "loop description", !hasLabelMachine && "label state machine"].filter(Boolean).join(", ")}` };
  },
  "M5.1": async (cwd) => {
    const log = readFileSafe(join(cwd, ".claude", "improvement-loop", "log.md"))
      ?? readFileSafe(join(cwd, ".claude", "metrics", "log.md"))
      ?? "";
    const dates = [...log.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => new Date(m[1]));
    if (dates.length < 6) return { passed: false, evidence: `${dates.length} dated entries (need ≥6)` };
    dates.sort((a, b) => a.getTime() - b.getTime());
    const span = (dates[dates.length - 1].getTime() - dates[0].getTime()) / (1000 * 60 * 60 * 24);
    const ok = dates.length >= 6 && span >= 35;
    return { passed: ok, evidence: `${dates.length} entries over ${Math.round(span)} days` };
  },
  "M5.2": async (cwd) => {
    const rootPkg = readFileSafe(join(cwd, "package.json")) ?? "";
    const rootClaude = readFileSafe(join(cwd, "CLAUDE.md")) ?? "";
    let depHit = /langfuse|@opentelemetry|honeycomb/i.test(rootPkg);
    if (!depHit) {
      for (const sub of ["packages/observability", "packages/agent-core", "services/agent"]) {
        const b = readFileSafe(join(cwd, sub, "package.json")) ?? "";
        if (/langfuse|@opentelemetry|honeycomb/i.test(b)) { depHit = true; break; }
      }
    }
    const docHit = /langfuse|opentelemetry|\botel\b/i.test(rootClaude);
    const ok = depHit || docHit;
    return { passed: ok, evidence: ok ? [depHit && "dep manifest references LLM observability", docHit && "CLAUDE.md documents observability"].filter(Boolean).join(", ") : "No Langfuse/OpenTelemetry references found" };
  },
  "F5.1": async (cwd) => {
    const skillsRoot = join(cwd, ".claude", "skills");
    let found = false;
    for (const s of subdirs(skillsRoot)) {
      const body = readFileSafe(join(skillsRoot, s, "SKILL.md")) ?? "";
      if (/meta-improvement/.test(body)) { found = true; break; }
    }
    return { passed: found, evidence: found ? "Skill references meta-improvement label" : "No skill creates meta-improvement issues" };
  },
  "F5.2": async (cwd) => {
    const skillsRoot = join(cwd, ".claude", "skills");
    let found = null;
    for (const s of subdirs(skillsRoot)) {
      const body = readFileSafe(join(skillsRoot, s, "SKILL.md")) ?? "";
      if (/circuit breaker|self[- ]tuning/i.test(body)) { found = s; break; }
    }
    return { passed: Boolean(found), evidence: found ? `Circuit breaker / self-tuning documented in .claude/skills/${found}/` : "No circuit breaker or self-tuning documented in any skill" };
  },
  "F5.3": async (cwd) => {
    const skillsRoot = join(cwd, ".claude", "skills");
    let found = null;
    for (const s of subdirs(skillsRoot)) {
      const body = readFileSafe(join(skillsRoot, s, "SKILL.md")) ?? "";
      if (/agent-failed/.test(body) && /(re[- ]queue|retry|re[- ]add)/i.test(body)) { found = s; break; }
    }
    return { passed: Boolean(found), evidence: found ? `Auto-recovery documented in .claude/skills/${found}/` : "No skill documents agent-failed re-queue logic" };
  },
  "G5.1": async (cwd) => {
    const agentsDir = join(cwd, ".claude", "agents");
    const reviewerAgent = existsSync(agentsDir) && readdirSync(agentsDir).some((f) => /review/i.test(f));
    const workflows = join(cwd, ".github", "workflows");
    const workflowReview = existsSync(workflows) && readdirSync(workflows).some((f) => /review/i.test(f));
    const ok = reviewerAgent || workflowReview;
    return { passed: ok, evidence: ok ? [reviewerAgent && "reviewer agent in .claude/agents/", workflowReview && "review workflow in .github/workflows/"].filter(Boolean).join(", ") : "No reviewer agent or review workflow" };
  },
  "G5.2": async (cwd) => {
    const workflows = join(cwd, ".github", "workflows");
    let ciRunsTests = false;
    if (existsSync(workflows)) {
      for (const f of readdirSync(workflows)) {
        const body = readFileSafe(join(workflows, f)) ?? "";
        if (/(^|\s)(pnpm|npm|yarn|bun)\s+(run\s+)?test\b/.test(body)) { ciRunsTests = true; break; }
      }
    }
    const precommit = readFileSafe(join(cwd, ".husky", "pre-commit")) ?? "";
    const precommitTests = /\btest\b/.test(precommit);
    const ok = ciRunsTests || precommitTests;
    return { passed: ok, evidence: ok ? [ciRunsTests && "CI workflow runs tests", precommitTests && "pre-commit runs tests"].filter(Boolean).join(", ") : "Neither CI nor pre-commit runs tests as a gate" };
  },
};
