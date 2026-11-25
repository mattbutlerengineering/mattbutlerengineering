/** Human-readable labels and one-line descriptions for AI Health sensors (keys are internal). */
const SENSORS: Readonly<Record<string, { label: string; description: string }>> = {
  acmm: { label: "ACMM maturity", description: "AI-codebase maturity level and progress" },
  prMetrics: {
    label: "Pull request metrics",
    description: "Throughput and cycle time for merged PRs",
  },
  metricsFreshness: {
    label: "Metrics freshness",
    description: "Whether each metric source has reported recently",
  },
  reviewBurden: { label: "Review burden", description: "How much human review agent PRs require" },
  productionHealth: {
    label: "Production health",
    description: "Live endpoint availability and response checks",
  },
  prCategoryMetrics: {
    label: "PRs by category",
    description: "PR volume and outcomes split by type (feat, fix, …)",
  },
  agentCost: { label: "Agent cost", description: "Spend on autonomous agent runs" },
  ccusageCost: {
    label: "Claude Code usage cost",
    description: "Claude Code token spend (from ccusage)",
  },
  ciHealth: { label: "CI health", description: "Pass rate and stability of CI pipelines" },
  lighthouse: {
    label: "Lighthouse scores",
    description: "Performance, accessibility, SEO and best-practice scores",
  },
  issues: { label: "Issues", description: "Open issue volume and age" },
  issueFeedback: {
    label: "Issue feedback",
    description: "Signals from issue comments and triage outcomes",
  },
  sessionLogs: { label: "Session logs", description: "Activity captured from agent session logs" },
  codeChurn: { label: "Code churn", description: "How much recently written code gets rewritten" },
  auditCoverage: {
    label: "Audit coverage",
    description: "Share of the codebase covered by audits",
  },
  mutationScore: {
    label: "Mutation score",
    description: "Share of injected bugs the test suite catches",
  },
  flakyTests: {
    label: "Flaky tests",
    description: "Tests that pass and fail without code changes",
  },
  e2eStability: { label: "E2E stability", description: "Reliability of end-to-end test runs" },
  queueEfficiency: {
    label: "Queue efficiency",
    description: "How efficiently the agent work queue turns issues into merged PRs",
  },
  sentry: { label: "Sentry", description: "Unresolved production errors reported to Sentry" },
  cors: {
    label: "CORS checks",
    description: "Cross-origin request configuration of live services",
  },
  bug: { label: "Bugs", description: "Open bug reports and how long they stay open" },
};

/** `someNewSensor` / `pass_rate_pct` → "Some new sensor" / "Pass rate pct". */
export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\s]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function sensorLabel(key: string): string {
  return SENSORS[key]?.label ?? humanizeKey(key);
}

export function describeSensor(key: string): string | null {
  return SENSORS[key]?.description ?? null;
}
