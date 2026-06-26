# AI Tooling Workflow Audit

**Date:** 2026-06-25
**Source:** [`mattbutlerengineering/ai-tooling`](https://github.com/mattbutlerengineering/ai-tooling) — STACK.md + WORKFLOW.md
**Adoption gate:** Run `/evaluate-tool <repo-url>` before adopting any new tool, skill, or MCP server.

---

## Summary

| Metric                  | Value |
| ----------------------- | ----- |
| STACK recommended tools | 31    |
| Installed (any form)    | 22    |
| Coverage                | 71%   |
| Genuine gaps            | 6     |
| Redundancies / overlaps | 3     |

---

## Installed Tools (vs STACK)

### Plugins (globally installed, enabled)

| Plugin                                                              | STACK stage                         | Status                  |
| ------------------------------------------------------------------- | ----------------------------------- | ----------------------- |
| `superpowers` (GSD, TDD, systematic-debugging, brainstorming, etc.) | Plan + Implement + Verify + Reflect | INSTALLED               |
| `context7`                                                          | Plan (live docs)                    | INSTALLED               |
| `code-review`                                                       | Review                              | INSTALLED               |
| `feature-dev`                                                       | Plan                                | INSTALLED               |
| `pr-review-toolkit`                                                 | Review                              | INSTALLED               |
| `security-guidance`                                                 | Review                              | INSTALLED               |
| `commit-commands`                                                   | Ship                                | INSTALLED               |
| `claude-mem`                                                        | Memory                              | INSTALLED               |
| `claude-reflect`                                                    | Reflect                             | INSTALLED               |
| `skill-creator`                                                     | Reflect                             | INSTALLED               |
| `frontend-design`                                                   | Implement (conditional)             | INSTALLED (conditional) |
| `prisma`                                                            | Implement (conditional)             | INSTALLED (conditional) |
| `github` (MCP)                                                      | Plan                                | INSTALLED               |
| `playwright`                                                        | Verify (via plugin)                 | INSTALLED               |
| `claude-code-setup`                                                 | Ship                                | INSTALLED               |
| `claude-md-management`                                              | Reflect                             | INSTALLED               |
| `plugin-dev`                                                        | Implement                           | INSTALLED               |
| `auth0`                                                             | Implement (conditional)             | INSTALLED (conditional) |

### Project-level MCP servers (`.mcp.json`)

| Server         | Purpose                           | Notes                                                    |
| -------------- | --------------------------------- | -------------------------------------------------------- |
| `semgrep`      | Security scanning (SAST)          | Project-specific; covers supply-chain rule               |
| `mbe-infra`    | Internal infra MCP                | Project-specific                                         |
| `langfuse`     | LLM observability + cost tracking | Covers Observability STACK requirement                   |
| `root-signals` | Eval quality signals              | Project-specific                                         |
| `github`       | GitHub API                        | Duplicates global `github` plugin                        |
| `sentry`       | Error monitoring                  | Covers error monitoring requirement                      |
| `playwright`   | Browser automation                | Duplicates global `playwright` plugin (see Redundancies) |
| `stripe`       | Stripe API                        | Project-specific (conditional)                           |

### Project-level skills (`.claude/skills/`)

| Skill                               | STACK stage                                        |
| ----------------------------------- | -------------------------------------------------- |
| `caveman`                           | Implement (Cost Efficiency — Layer 2 prose output) |
| `graphify`                          | Plan (deep structural analysis)                    |
| `tdd`                               | Implement + Verify                                 |
| `implement-queue`                   | Ship + Outer Loop (monorepo-specific)              |
| `site-audit`                        | Outer Loop (monorepo-specific)                     |
| `ci-monitor`                        | Ship (monorepo-specific)                           |
| `sentry-triage`                     | Outer Loop / Reflect                               |
| `learning-loop`                     | Outer Loop / Reflect                               |
| `progress-tracker`                  | Outer Loop / Reflect                               |
| `to-issues`                         | Decompose                                          |
| `improve`                           | Review                                             |
| `improve-codebase-architecture`     | Architect                                          |
| `diagnose`                          | Verify                                             |
| `revert-rca-loop`                   | Reflect                                            |
| `triage`                            | Discover                                           |
| `decompose`                         | Decompose                                          |
| `gotcha-harvest`                    | Reflect                                            |
| `grill-me` / `grill-with-docs`      | Discover / Plan                                    |
| `new-adr`                           | Architect                                          |
| `perf-budget`                       | Verify                                             |
| `new-service` / `new-service-route` | Architect                                          |

---

## Stage-by-Stage Status

### Inner Loop

| Stage         | STACK Tool                                 | Status              | Notes                                                                                               |
| ------------- | ------------------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------- |
| **Plan**      | context7                                   | INSTALLED           |                                                                                                     |
|               | GSD / superpowers                          | INSTALLED           | superpowers includes GSD                                                                            |
|               | feature-dev                                | INSTALLED           |                                                                                                     |
|               | github-mcp-server                          | INSTALLED           | global plugin + `.mcp.json` entry (duplicate — see Redundancies)                                    |
|               | graphify                                   | INSTALLED           | project skill                                                                                       |
|               | codegraph                                  | MISSING             | not installed; graphify covers deep analysis but codegraph adds live always-on indexing             |
|               | markitdown                                 | MISSING             | no PDF/Office-to-Markdown converter                                                                 |
| **Implement** | caveman                                    | INSTALLED           | project skill                                                                                       |
|               | mattpocock/skills                          | INSTALLED           | global skill collection                                                                             |
|               | agent-skills                               | MISSING             | addyosmani/agent-skills — `/spec → /ship` lifecycle; ships `documentation-and-adrs`                 |
|               | headroom                                   | MISSING             | Layer-1 tool-output compression (60–95%); caveman covers Layer-2 prose but not tool output          |
|               | claude-squad                               | MISSING             | parallel session TUI; implement-queue workers use `mbe agent run` instead                           |
|               | beads                                      | MISSING             | work-coordination ledger; overlap risk given `implement-queue` already prevents duplicate effort    |
| **Verify**    | playwright                                 | INSTALLED           | global plugin + `.mcp.json` (redundant — see Redundancies)                                          |
|               | stryker-js                                 | MISSING             | mutation testing; referenced in issue #2526 W5 as a deliberate gap                                  |
|               | superpowers verification-before-completion | INSTALLED           | part of superpowers plugin                                                                          |
|               | web-quality-skills                         | INSTALLED (partial) | `perf-budget`, `site-audit` cover some; full `addyosmani/web-quality-skills` not installed globally |
| **Review**    | code-review                                | INSTALLED           |                                                                                                     |
|               | pr-review-toolkit                          | INSTALLED           |                                                                                                     |
|               | security-guidance                          | INSTALLED           | first-party security review                                                                         |
|               | trailofbits/skills                         | MISSING             | professional security audit; STACK Tier 2 (REVIEW, not run hands-on)                                |
| **Ship**      | commit-commands                            | INSTALLED           |                                                                                                     |
|               | claude-code-action                         | MISSING             | `@claude` in PRs/issues for async review; `.github/workflows/claude.yml` not present                |
|               | resolving-merge-conflicts                  | INSTALLED           | mattpocock/skills includes this                                                                     |
| **Reflect**   | claude-reflect                             | INSTALLED           |                                                                                                     |
|               | claude-mem                                 | INSTALLED           |                                                                                                     |
|               | documentation-and-adrs                     | MISSING             | ships in agent-skills (not installed); ADR workflow handled by `new-adr` skill instead              |

### Outer Loop

| Stage          | STACK Tool                 | Status    | Notes                                       |
| -------------- | -------------------------- | --------- | ------------------------------------------- |
| **Discover**   | GSD new-project / grill-me | INSTALLED | grill-me project skill + superpowers GSD    |
| **Architect**  | graphify                   | INSTALLED | project skill                               |
|                | map-codebase               | INSTALLED | superpowers GSD includes this               |
| **Decompose**  | to-issues / to-prd         | INSTALLED | project skills                              |
|                | GSD milestone/phase        | INSTALLED | superpowers                                 |
| **Integrate**  | claude-squad               | MISSING   | not installed; mbe worktrees fill this role |
|                | worktrunk                  | MISSING   | not installed; mbe worktrees fill this role |
| **Retrospect** | claude-mem timeline        | INSTALLED |                                             |
|                | claude-reflect             | INSTALLED |                                             |

### Cross-Cutting

| Area                                        | STACK Tool           | Status    | Notes                                                     |
| ------------------------------------------- | -------------------- | --------- | --------------------------------------------------------- |
| **Cost Efficiency — prose (Layer 2)**       | caveman              | INSTALLED | ~60-75% output reduction                                  |
| **Cost Efficiency — tool output (Layer 1)** | headroom             | MISSING   | 60-95% tool-output compression; no Layer-1 tool installed |
| **Observability — live**                    | abtop                | MISSING   | real-time TUI; not installed                              |
| **Observability — historical**              | ccusage              | MISSING   | session cost reports; Langfuse partially covers this      |
| **Observability — LLM tracing**             | langfuse             | INSTALLED | via `.mcp.json`; agent sessions are traced                |
| **Security — skill supply-chain**           | SkillSpector         | MISSING   | conditional; relevant now that skill ecosystem is growing |
| **Memory**                                  | claude-mem           | INSTALLED | primary memory system                                     |
|                                             | OMEGA (omega-memory) | REDUNDANT | see Redundancies; W4 in #2526 tracks formal retirement    |

---

## Redundancies

### 1. `playwright` installed twice

- `playwright@claude-plugins-official` (global plugin, currently **disabled**)
- `.mcp.json` entry `playwright: npx -y @playwright/mcp@latest` (project-level, **active**)

WORKFLOW.md says: "Multiple tools solving the same problem." The global plugin is disabled, so no functional conflict today, but the double entry creates confusion. **Recommendation:** keep `.mcp.json` as the canonical source; confirm the global plugin stays disabled.

### 2. `github` MCP registered twice

- `github@claude-plugins-official` (global plugin, **enabled**)
- `.mcp.json` entry `github: npx -y @modelcontextprotocol/server-github` (project-level)

Two separate GitHub MCP server binaries (`@modelcontextprotocol/server-github` vs Copilot MCP at `https://api.githubcopilot.com/mcp/`) loaded simultaneously. These aren't strictly identical — the Copilot endpoint from STACK adds code-search; the `@modelcontextprotocol/server-github` is the OSS community version. But both answer GitHub API calls. **Recommendation:** evaluate whether both are providing distinct value; if not, consolidate to one.

### 3. OMEGA memory vs claude-mem

- OMEGA hooks fire at `SessionStart` and `PostToolUse` (global settings), burning tokens on every session.
- `claude-mem` is installed and is the STACK-recommended primary memory system.

WORKFLOW.md anti-pattern: _"Multiple tools solving the same problem — e.g., both OMEGA and claude-mem running as memory."_ This is exactly the documented case. Issue #2526 W4 tracks formal retirement of OMEGA into an ADR. **This item is `ready-for-human`** — the fix touches global `settings.json` and requires an ADR (ADR-012).

---

## Genuine Gaps (prioritized)

| Priority | Gap                                           | STACK Stage         | Effort | Notes                                                                                                       |
| -------- | --------------------------------------------- | ------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| **1**    | `headroom` (Layer-1 tool-output compression)  | Implement           | Low    | pip/npm install; fills the only Layer-1 slot; caveman covers Layer-2 already                                |
| **2**    | `agent-skills` (addyosmani/agent-skills)      | Implement + Reflect | Low    | also delivers `documentation-and-adrs` skill                                                                |
| **3**    | `claude-code-action` (async `@claude` in PRs) | Ship                | Medium | requires `.github/workflows/claude.yml`; adds async PR review                                               |
| **4**    | `stryker-js` mutation testing                 | Verify              | Medium | W5 in #2526; mutation score as sensor                                                                       |
| **5**    | `codegraph`                                   | Plan                | Medium | always-on code graph; trial with kill-switch per #2526 W8                                                   |
| **6**    | `abtop` / `ccusage`                           | Observability       | Low    | real-time + historical cost monitoring; Langfuse covers LLM-layer tracing but not per-session CLI summaries |

**Not gaps (covered by alternatives):**

- `claude-squad` / `worktrunk`: `mbe` worktree isolation + `implement-queue` fills the parallel-session coordination role
- `beads`: `implement-queue` label state machine prevents duplicate effort
- `trailofbits/skills`: `security-guidance` plugin + `semgrep` MCP cover first-party + SAST; trailofbits adds external methodology (Tier 2 review-only in STACK)
- `markitdown`: no binary-document ingestion workflow active today; add when the need arises

---

## Missing Feedback Loops (infrastructure, not installable tools)

Per WORKFLOW.md's checklist:

| Loop                                     | Status    | Notes                                                                            |
| ---------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| Coverage gating in CI                    | PARTIAL   | Tests run in CI but no hard coverage gate enforced                               |
| PR acceptance rate tracking              | INSTALLED | `.claude/acmm/report.md` tracks agent PR outcomes (section: "Agent PR outcomes") |
| Flaky test detection                     | PARTIAL   | `learning-loop` skill tracks CI flake rate; no weekly automated scrub            |
| Error monitoring → auto-issue creation   | INSTALLED | Sentry MCP + `sentry-triage` skill                                               |
| Merge conflict frequency                 | MISSING   | not tracked                                                                      |
| AI code churn rate (% rewritten ≤7 days) | MISSING   | W6 in #2526                                                                      |
| Mutation score sensor                    | MISSING   | W5 in #2526                                                                      |
| PR acceptance rate by category           | MISSING   | ACMM tracks aggregate; no category breakdown                                     |

---

## ai-tooling Plugin — Marketplace Registration

The `ai-tooling` repo ships a `.claude-plugin/marketplace.json`. The skills (audit-workflow, evaluate-tool, setup-workflow, sync-stars, update-catalog) live at `skills/` in the repo.

**To install from the marketplace:**

```bash
claude plugins:add-marketplace https://github.com/mattbutlerengineering/ai-tooling.git
claude plugins:install ai-tooling
```

The marketplace entry is added to `extraKnownMarketplaces` in `~/.claude/settings.json` (user-level) and the plugin is tracked in `~/.claude/plugins/installed_plugins.json`. This is a global user install, not project-committed — no project files need to change for the skills to be available. The skills are source-of-truth in the `ai-tooling` repo and are invoked via the slash commands documented there.

**Status:** The marketplace is not yet registered. The skills (`/audit-workflow`, `/evaluate-tool`) are operationally available from the ai-tooling repo directly (this report was produced by manually following the `audit-workflow` SKILL.md protocol). Register the marketplace when the skill slash-commands should be invocable from within the project session.

---

## Next Actions

1. **Fix Redundancy 3 (OMEGA vs claude-mem)** — W4 in #2526; open ADR-012, retire OMEGA hooks from `~/.claude/settings.json`. `ready-for-human`.
2. **Install `headroom`** — fills Layer-1 tool-output compression gap (highest token-efficiency ROI). File as `ready` issue.
3. **Install `agent-skills`** — delivers `/spec → /ship` lifecycle + `documentation-and-adrs`. File as `ready` issue.
4. **Add `claude-code-action` workflow** — async `@claude` in PRs. File as `ready` issue.
5. **Activate `stryker-js`** — W5 in #2526. File as `ready` issue.
6. **Consolidate duplicate `github` MCP** — evaluate which server is providing distinct value.
7. **Resolve `playwright` double-registration** — confirm global plugin stays disabled; keep `.mcp.json` as canonical.
