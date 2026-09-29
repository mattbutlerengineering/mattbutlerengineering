/**
 * Local extensions — repo-specific criteria invented on top of the upstream
 * ACMM catalog (docs/acmm/gaps.md, #844) that are NOT part of the cited
 * upstream frameworks (kubestellar/console, Fullsend, AEF, Claude Reflect).
 *
 * `definesLevels: false` — this source never gates the published ACMM level.
 * It exists so these ideas stay visible (headline count, `--project` reports)
 * without letting a repo-invented, self-graded criterion move the number
 * that's supposed to measure parity against an external, cited standard.
 *
 * Moved out of the gating `acmm` source by #5853 (originally proposed as
 * "local metrics ... as experimental extensions" in docs/acmm/gaps.md:159,
 * but instead landed in the gating source for 5 months — see #5851's audit).
 */
const CRITERIA = [
  {
    id: "local:budget-policy",
    source: "local",
    level: 4,
    category: "governance",
    name: "Budget policy",
    description:
      "Defined cost limits and budget controls for AI agent operations, including token usage tracking.",
    rationale:
      "Autonomous systems have explicit cost boundaries to prevent unbounded spending, and visibility into consumption to enforce them.",
    details:
      "A budget policy defines per-task, daily, and weekly cost limits for AI operations, plus the token/cost tracking data those limits are measured against. Absorbs the former acmm:token-tracking criterion — the two describe one file, not two signals.",
    detection: {
      type: "any-of",
      pattern: [
        ".claude/budget-policy.json",
        "docs/acmm/cost-governance.md",
        ".claude/acmm/cost-metrics.json",
      ],
    },
  },
  {
    id: "local:code-graph",
    source: "local",
    level: 4,
    category: "readiness",
    name: "Code intelligence tooling",
    description: "LSP, AST, or code graph tooling that helps AI navigate the codebase.",
    rationale:
      "The AI can navigate complex type hierarchies and dependency graphs efficiently, not just read file text.",
    details:
      "Code intelligence tools (LSP configs, tags files, tree-sitter grammars, or code graph generators) help the AI understand codebase structure beyond raw text. `tsconfig.json` was dropped from the pattern list — every TypeScript repo has one, so it proved nothing.",
    detection: {
      type: "any-of",
      pattern: [
        ".vscode/settings.json",
        "tags",
        "TAGS",
        ".ctags",
        ".tree-sitter/",
        "llms.txt",
        "llms-full.txt",
        ".clangd",
        "pyrightconfig.json",
        ".claude/plugins/",
      ],
    },
  },
  {
    id: "local:mcp-server-config",
    source: "local",
    level: 4,
    category: "readiness",
    name: "MCP server configuration",
    description: "Model Context Protocol servers configured for AI tool access.",
    rationale:
      "The AI has access to project-relevant tools (databases, APIs, deployment consoles) beyond the file system.",
    details:
      "MCP servers give the AI programmatic access to external systems. Without them, the AI is limited to file system operations and cannot query databases, check deployments, or interact with project management tools.",
    detection: {
      type: "any-of",
      pattern: [".mcp.json", ".claude/mcp.json", ".cursor/mcp.json", "mcp.json"],
    },
  },
  {
    id: "local:explanation-standards",
    source: "local",
    level: 4,
    category: "feedback-loop",
    name: "Explanation quality standards",
    description: "Rubric defining quality expectations for AI-authored PRs and commits.",
    rationale:
      "Acceptance rate measures outcome but not understanding; explanation rubrics help audit AI intent.",
    details:
      "An explanation quality rubric defines what makes a good agent PR description (reasoning, test plan, risk) and commit message. Doc-only by design; nothing in this repo enforces it mechanically.",
    detection: {
      type: "any-of",
      pattern: [
        "docs/acmm/explanation-standards.md",
        "docs/review-criteria.md",
        ".github/prompts/review.md",
      ],
    },
  },
  {
    id: "local:feedback-loop-inventory",
    source: "local",
    level: 4,
    category: "feedback-loop",
    name: "Feedback loop inventory",
    description:
      "A document cataloging all feedback loops with their ACMM level, frequency, and operating status.",
    rationale:
      'Making feedback loop topology explicit enables auditing and prevents the "dashboard graveyard" anti-pattern.',
    details:
      "The real inventory of this repo's loops is docs/scheduled-tasks.md plus the improvement-loop log, not this static document — kept here as a display-only signal, never gating.",
    detection: { type: "path", pattern: "docs/acmm/feedback-loop-inventory.md" },
  },
  {
    id: "local:repo-bench",
    source: "local",
    level: 4,
    category: "readiness",
    name: "Repo benchmark",
    description: "Seeded-bug benchmark that measures AI capability on this specific codebase.",
    rationale:
      "Acceptance rate is binary; benchmarks show capability progression and model comparison.",
    details:
      "A repo benchmark injects known bugs (missing imports, wrong status codes, type errors) and measures how many turns and how long the AI takes to fix them.",
    detection: {
      type: "grep",
      pattern: { file: ".claude/acmm/repo-bench-results.json", contains: '"results"' },
    },
  },
  {
    id: "local:onboarding-benchmark",
    source: "local",
    level: 3,
    category: "feedback-loop",
    name: "Onboarding benchmark",
    description:
      "A benchmark script measuring how effectively the codebase teaches new AI sessions.",
    rationale:
      'Quantifies the "codebase as model" concept -- whether instruction files and patterns effectively onboard new agents.',
    details:
      "An onboarding benchmark defines known tasks of increasing difficulty and expected completion times. Running these tasks in fresh AI sessions measures how well project documentation enables the AI to work independently.",
    detection: {
      type: "grep",
      pattern: { file: ".claude/acmm/onboarding-benchmark.json", contains: '"results"' },
    },
  },
  {
    id: "local:agent-attestation",
    source: "local",
    level: 5,
    category: "governance",
    name: "Agent identity attestation",
    description:
      "Documented strategy for AI agent identity and non-repudiation of agent-authored changes.",
    rationale:
      "Autonomous systems need verifiable identity so changes can be attributed and audited.",
    details:
      "Agent attestation covers how AI-authored commits are identified (branch naming, bot accounts, GPG signing) and how the audit trail connects git history to session traces. Doc-only in this repo.",
    detection: {
      type: "any-of",
      pattern: ["docs/acmm/agent-attestation.md", "docs/security/agent-identity.md"],
    },
  },
  {
    id: "local:ai-compliance-doc",
    source: "local",
    level: 5,
    category: "governance",
    name: "AI compliance documentation",
    description: "Documentation mapping AI workflows to regulatory and compliance requirements.",
    rationale: "Regulated environments need to audit not just code but AI process compliance.",
    details:
      "AI compliance documentation maps what data agents can access, how decisions are traced, and how the system relates to regulatory frameworks (GDPR, SOC2).",
    detection: {
      type: "any-of",
      pattern: ["docs/acmm/ai-compliance-doc.md", "docs/compliance/ai-workflows.md"],
    },
  },
  {
    id: "local:ai-health-dashboard",
    source: "local",
    level: 5,
    category: "observability",
    name: "AI system health monitoring",
    description:
      "Dashboard or script monitoring AI agent system health (latency, errors, stuck rate).",
    rationale: "The system monitors its own operational health, not just the code it produces.",
    details:
      "AI health monitoring tracks the agent system itself — session success rate, API errors, stuck loops, cost per session. scripts/acmm/ai-health-check.sh has no caller in this repo.",
    detection: {
      type: "any-of",
      pattern: ["docs/acmm/ai-health-monitoring.md", "scripts/acmm/ai-health-check.sh"],
    },
  },
  {
    id: "local:ai-service-fallback",
    source: "local",
    level: 5,
    category: "governance",
    name: "AI service fallback policy",
    description: "Defined behavior for when AI APIs are unavailable or degraded.",
    rationale:
      "Autonomous systems must degrade gracefully when their AI service is down, not break silently.",
    details:
      "A fallback policy defines retry strategies, circuit breakers, and escalation paths for AI API failures. Without this, L6 autonomous loops stop silently when the API is unavailable, and scheduled tasks skip without notification.",
    detection: {
      type: "grep",
      pattern: {
        file: "infrastructure/worker/circuit-breaker.js",
        contains: "CIRCUIT_BREAKER_KEY",
      },
    },
  },
  {
    id: "local:override-analytics",
    source: "local",
    level: 5,
    category: "feedback-loop",
    name: "Override analytics",
    description: "Taxonomy and trending for human corrections of AI suggestions.",
    rationale:
      "Understanding WHY humans correct AI enables systematic improvement, not just counting corrections.",
    details:
      "Override analytics categorizes human corrections (safety, correctness, style, scope) and trends them over time. Doc taxonomy only in this repo; nothing classifies real corrections against it yet.",
    detection: { type: "any-of", pattern: ["docs/acmm/override-analytics.md"] },
  },
  {
    id: "local:prompt-injection-sandbox",
    source: "local",
    level: 5,
    category: "governance",
    name: "Prompt injection defense",
    description: "Documented threat model and defense layers for AI prompt injection.",
    rationale:
      "Autonomous systems that ingest untrusted text need documented defenses against injection attacks.",
    details:
      "L5/L6 systems process untrusted text from GitHub issues, PR comments, and external APIs. A prompt injection threat model documents the attack surface, existing defenses, and gaps.",
    detection: {
      type: "any-of",
      pattern: ["docs/security/ai-prompt-injection.md", "docs/security/ai-threat-model.md"],
    },
  },
  {
    id: "local:review-burden",
    source: "local",
    level: 5,
    category: "observability",
    name: "Review burden tracking",
    description: "Metrics tracking human review fatigue and sustainable review load.",
    rationale:
      "Autonomous systems can overwhelm reviewers; measuring review burden prevents quality degradation.",
    details:
      "Review burden tracking monitors PRs per reviewer, review time, and auto-merge ratio. The real signal is metrics/review-burden.json (collected via metrics-collectors.yml), not this doc.",
    detection: { type: "any-of", pattern: ["docs/acmm/review-burden.md"] },
  },
  {
    id: "local:self-correction-metric",
    source: "local",
    level: 5,
    category: "observability",
    name: "Self-correction tracking",
    description: "Metrics tracking AI fix-up cycles, first-attempt success, and revert rates.",
    rationale:
      "The system monitors its own output quality beyond binary acceptance, enabling self-improvement.",
    details:
      "Self-correction metrics track how often AI PRs need fix-up commits after initial push, what percentage pass CI on the first attempt, and how often they get reverted. The real mechanism is plugins/acmm/scripts/pr-outcomes.js.",
    detection: {
      type: "any-of",
      pattern: ["docs/acmm/explanation-standards.md", "plugins/acmm/scripts/pr-outcomes.js"],
    },
  },
  {
    id: "local:multi-repo-orchestration",
    source: "local",
    level: 6,
    category: "autonomy",
    name: "Multi-repo orchestration",
    description: "Strategy for coordinating AI changes across multiple dependent repositories.",
    rationale: "Fully autonomous systems need to coordinate changes beyond a single repo boundary.",
    details:
      "Multi-repo orchestration covers how AI agents coordinate changes across dependent repos — updating shared libraries, publishing new versions, and opening downstream PRs. No such mechanism exists in this single-repo project; the doc has been filed as a gap four separate times (#3594, #3595, #3649, #3710) with nothing to show for it.",
    detection: {
      type: "grep",
      pattern: {
        file: "docs/acmm/multi-repo-orchestration.md",
        contains: "Executed: \\d{4}-\\d{2}-\\d{2}",
      },
    },
  },
];

export const localSource = {
  id: "local",
  name: "Local Extensions",
  url: "https://github.com/mattbutlerengineering/mattbutlerengineering/blob/main/docs/acmm/gaps.md",
  citation:
    "Repo-invented criteria proposed in docs/acmm/gaps.md (#844) as experimental extensions. Not part of any cited upstream framework — never gates the published level.",
  definesLevels: false,
  criteria: CRITERIA,
};
