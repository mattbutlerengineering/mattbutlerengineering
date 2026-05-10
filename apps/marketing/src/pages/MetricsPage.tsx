import { Card, Heading, Stat, Text } from "@mattbutlerengineering/rialto";
import styles from "./MetricsPage.module.css";

// PR acceptance data from docs/metrics/pr-acceptance.json (latest entry)
const PR_ACCEPTANCE = {
  date: "2026-05-02",
  window_days: 30,
  total_ai_prs: 40,
  merged: 40,
  rejected: 0,
  acceptance_rate: 1,
};

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

export function MetricsPage() {
  const acceptanceDisplay = formatPercent(PR_ACCEPTANCE.acceptance_rate);
  const windowLabel = `${PR_ACCEPTANCE.window_days}-day window`;
  const lastUpdated = new Date(PR_ACCEPTANCE.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>Quality Metrics</Heading>
        <Text className={styles.subtitle}>
          AI codebase health — last updated {lastUpdated}
        </Text>
      </header>

      <section className={styles.section}>
        <Heading level={2} className={styles.sectionTitle}>
          Agent Performance
        </Heading>
        <div className={styles.statGrid}>
          <Card className={styles.statCard}>
            <Stat
              label="PR Acceptance Rate"
              value={acceptanceDisplay}
              delta={`${PR_ACCEPTANCE.merged} / ${PR_ACCEPTANCE.total_ai_prs} merged`}
              trend="neutral"
              size="lg"
            />
            <Text className={styles.meta}>{windowLabel}</Text>
          </Card>
          <Card className={styles.statCard}>
            <Stat
              label="PRs Rejected"
              value={String(PR_ACCEPTANCE.rejected)}
              delta={windowLabel}
              trend="neutral"
              size="lg"
            />
            <Text className={styles.meta}>No regressions introduced</Text>
          </Card>
          <Card className={styles.statCard}>
            <Stat
              label="Total AI PRs"
              value={String(PR_ACCEPTANCE.total_ai_prs)}
              delta={windowLabel}
              trend="neutral"
              size="lg"
            />
            <Text className={styles.meta}>Agent-authored pull requests</Text>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2} className={styles.sectionTitle}>
          Code Quality
        </Heading>
        <div className={styles.statGrid}>
          <Card className={styles.statCard}>
            <Stat label="Eval Pass Rate" value="—" trend="neutral" size="lg" />
            <Text className={styles.meta}>No eval data yet</Text>
          </Card>
          <Card className={styles.statCard}>
            <Stat label="CI Health" value="—" trend="neutral" size="lg" />
            <Text className={styles.meta}>See /status for live checks</Text>
          </Card>
          <Card className={styles.statCard}>
            <Stat label="Test Coverage" value="—" trend="neutral" size="lg" />
            <Text className={styles.meta}>Coverage trends coming soon</Text>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2} className={styles.sectionTitle}>
          Review Burden
        </Heading>
        <div className={styles.statGrid}>
          <Card className={styles.statCard}>
            <Stat label="Avg Review Cycles" value="—" trend="neutral" size="lg" />
            <Text className={styles.meta}>No review-burden data yet</Text>
          </Card>
          <Card className={styles.statCard}>
            <Stat label="Avg Time to Merge" value="—" trend="neutral" size="lg" />
            <Text className={styles.meta}>Review turnaround pending</Text>
          </Card>
        </div>
      </section>
    </div>
  );
}
