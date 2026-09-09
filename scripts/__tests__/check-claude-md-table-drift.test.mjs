import { test, expect, describe, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Builds a minimal but internally-consistent fixture repo: a CLAUDE.md with
 * the three drift-checked tables, a `tools/cli/src/index.ts` + commands
 * tree matching the CLI table, `.claude/skills` and `plugins/<name>/skills`
 * directories matching the skills tables, and `.claude/agents` markdown
 * files matching the subagents table. Individual tests mutate one side
 * (table or tree) to assert a specific drift finding.
 */
function writeCleanFixture(root) {
  fs.mkdirSync(path.join(root, "tools", "cli", "src", "commands", "agent"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude", "skills", "ideate"), { recursive: true });
  fs.mkdirSync(path.join(root, "plugins", "acmm", "skills", "acmm-audit"), { recursive: true });
  fs.mkdirSync(path.join(root, ".claude", "agents"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "tools", "cli", "src", "index.ts"),
    [
      'import { Command } from "commander";',
      'import { loginCommand } from "./commands/login.js";',
      'import { agentCommand } from "./commands/agent.js";',
      "const program = new Command();",
      "program.addCommand(loginCommand);",
      "program.addCommand(agentCommand);",
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(root, "tools", "cli", "src", "commands", "login.ts"),
    'import { Command } from "commander";\nexport const loginCommand = new Command("login").description("Authenticate");\n'
  );

  fs.writeFileSync(
    path.join(root, "tools", "cli", "src", "commands", "agent.ts"),
    [
      'import { Command } from "commander";',
      'import { runCommand } from "./agent/run.js";',
      'export const agentCommand = new Command("agent").description("Run agents");',
      "agentCommand.addCommand(runCommand);",
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(root, "tools", "cli", "src", "commands", "agent", "run.ts"),
    'import { Command } from "commander";\nexport const runCommand = new Command("run").description("Run once");\n'
  );

  fs.writeFileSync(path.join(root, ".claude", "skills", "ideate", "SKILL.md"), "# ideate\n");
  fs.writeFileSync(
    path.join(root, "plugins", "acmm", "skills", "acmm-audit", "SKILL.md"),
    "# acmm-audit\n"
  );

  fs.writeFileSync(
    path.join(root, ".claude", "agents", "reviewer.md"),
    "---\nname: reviewer\ndescription: reviews things\n---\n\nBody text.\n"
  );

  fs.writeFileSync(
    path.join(root, "CLAUDE.md"),
    [
      "## mbe CLI Commands",
      "",
      "All top-level commands registered in `tools/cli/src/index.ts`:",
      "",
      "| Command | Subcommands | Purpose |",
      "| --- | --- | --- |",
      "| `login` | — | Authenticate with the API |",
      "| `agent` | `run` | Run autonomous coding agents |",
      "",
      "### Skills",
      "",
      "**Project Automation** (`.claude/skills/`)",
      "",
      "| Skill | Purpose |",
      "| --- | --- |",
      "| `/ideate` | Autonomous feature ideation |",
      "| `/acmm-audit` | now ships as the `plugins/acmm` plugin (extracted in #818), not a `.claude/skills/` entry |",
      "",
      "### Scaffolding Skills",
      "",
      "| Skill | Purpose |",
      "| --- | --- |",
      "",
      "### Subagents",
      "",
      "`.claude/agents/` holds specialist subagents.",
      "",
      "| Subagent | Catches | When to invoke |",
      "| --- | --- | --- |",
      "| `reviewer` | Bad diffs | Before merge |",
      "",
      "### GitHub Labels (coordination state machine)",
      "",
      "| Label | Meaning |",
      "| --- | --- |",
      "| `ready` | Available for pickup |",
    ].join("\n") + "\n"
  );
}

describe("check-claude-md-table-drift", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-md-table-drift-"));
    writeCleanFixture(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("clean fixture reports no findings", async () => {
    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    expect(findTableDrift(tmpDir)).toEqual([]);
  });

  test("CLI command documented but absent from source is flagged", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      fs
        .readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8")
        .replace("| `login` | — | Authenticate with the API |\n", "")
        .replace(
          "| `agent` | `run` | Run autonomous coding agents |",
          "| `agent` | `run` | Run autonomous coding agents |\n| `ghost` | — | Does not exist in source |"
        )
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings).toContainEqual({
      table: "mbe CLI Commands",
      kind: "documented-but-absent",
      name: "ghost",
    });
  });

  test("CLI command present in source but undocumented is flagged", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "tools", "cli", "src", "commands", "logout.ts"),
      'import { Command } from "commander";\nexport const logoutCommand = new Command("logout").description("Clear tokens");\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, "tools", "cli", "src", "index.ts"),
      fs
        .readFileSync(path.join(tmpDir, "tools", "cli", "src", "index.ts"), "utf-8")
        .replace(
          'import { agentCommand } from "./commands/agent.js";',
          'import { agentCommand } from "./commands/agent.js";\nimport { logoutCommand } from "./commands/logout.js";'
        )
        .replace(
          "program.addCommand(agentCommand);",
          "program.addCommand(agentCommand);\nprogram.addCommand(logoutCommand);"
        )
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings).toContainEqual({
      table: "mbe CLI Commands",
      kind: "present-but-undocumented",
      name: "logout",
    });
  });

  test("a Command declared but never registered in index.ts is not flagged (dead code, e.g. compound)", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "tools", "cli", "src", "commands", "compound.ts"),
      'import { Command } from "commander";\nexport const compoundCommand = new Command("compound").description("unreachable");\n'
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings.find((f) => f.name === "compound")).toBeUndefined();
  });

  test("skill documented but absent from .claude/skills/ is flagged", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      fs
        .readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8")
        .replace(
          "| `/ideate` | Autonomous feature ideation |",
          "| `/ideate` | Autonomous feature ideation |\n| `/ghost-skill` | Does not exist on disk |"
        )
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings).toContainEqual({
      table: "Skills",
      kind: "documented-but-absent",
      name: "ghost-skill",
    });
  });

  test("skill present on disk but undocumented is flagged", async () => {
    fs.mkdirSync(path.join(tmpDir, ".claude", "skills", "orphan-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "skills", "orphan-skill", "SKILL.md"),
      "# orphan\n"
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings).toContainEqual({
      table: "Skills",
      kind: "present-but-undocumented",
      name: "orphan-skill",
    });
  });

  test("plugin-extraction carve-out: /acmm-audit resolves under plugins/*/skills/ and is not flagged", async () => {
    // The clean fixture already has /acmm-audit documented, absent from
    // .claude/skills/, and present under plugins/acmm/skills/acmm-audit/
    // with a purpose cell naming the plugin — mirrors the real repo's row.
    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings.find((f) => f.name === "acmm-audit")).toBeUndefined();
  });

  test("plugin-extraction carve-out does not apply when the row doesn't mention 'plugin'", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      fs
        .readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8")
        .replace(
          "| `/acmm-audit` | now ships as the `plugins/acmm` plugin (extracted in #818), not a `.claude/skills/` entry |",
          "| `/acmm-audit` | Score repo against the maturity model |"
        )
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings).toContainEqual({
      table: "Skills",
      kind: "documented-but-absent",
      name: "acmm-audit",
    });
  });

  test("subagent documented but absent is flagged", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      fs
        .readFileSync(path.join(tmpDir, "CLAUDE.md"), "utf-8")
        .replace(
          "| `reviewer` | Bad diffs | Before merge |",
          "| `reviewer` | Bad diffs | Before merge |\n| `ghost-reviewer` | Nothing | Never |"
        )
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings).toContainEqual({
      table: "Subagents",
      kind: "documented-but-absent",
      name: "ghost-reviewer",
    });
  });

  test("subagent present but undocumented is flagged", async () => {
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "agents", "orphan-reviewer.md"),
      "---\nname: orphan-reviewer\ndescription: not in the table\n---\n\nBody.\n"
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings).toContainEqual({
      table: "Subagents",
      kind: "present-but-undocumented",
      name: "orphan-reviewer",
    });
  });

  test("subagent detection reads frontmatter name:, not the filename", async () => {
    // File is named mismatched-filename.md but its frontmatter name: differs.
    // The CLAUDE.md table documents "reviewer" (from the clean fixture) and
    // this file's frontmatter also says "reviewer" — despite living in a
    // differently-named file. If the check read the filename instead, it
    // would report both "mismatched-filename" (present-but-undocumented)
    // and, depending on implementation, miss that "reviewer" is satisfied.
    fs.rmSync(path.join(tmpDir, ".claude", "agents", "reviewer.md"));
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "agents", "mismatched-filename.md"),
      "---\nname: reviewer\ndescription: reviews things\n---\n\nBody text.\n"
    );

    const { findTableDrift } = await import("../check-claude-md-table-drift.mjs");
    const findings = findTableDrift(tmpDir);

    expect(findings.find((f) => f.table === "Subagents")).toBeUndefined();
  });
});
