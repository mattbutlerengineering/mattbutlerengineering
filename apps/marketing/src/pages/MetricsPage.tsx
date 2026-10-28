import { useQuery } from "@tanstack/react-query";
import { Card, Badge, Heading, Text, Spinner, Banner } from "@mattbutlerengineering/rialto";
import { formatRatio, formatDate, isStale } from "../utils/formatters.js";
import styles from "./MetricsPage.module.css";
import { DashboardPurpose } from "../components/DashboardPurpose";

interface BehavioralGate {
  readonly level: number;
  readonly name: string;
  readonly passed: boolean;
  readonly value: number;
  readonly threshold: number;
}

interface HistoryEntry {
  readonly date: string;
  readonly level: number;
  readonly detected: number;
  readonly total: number;
}

interface RecentAgentChange {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly mergedAt: string;
}

interface AcmmMetrics {
  readonly schema: string;
  readonly generatedAt: string;
  readonly level: number;
  readonly levelName: string;
  readonly role: string;
  readonly summary: {
    readonly detected: number;
    readonly total: number;
    readonly coverage: number;
  };
  readonly prerequisites: {
    readonly met: number;
    readonly total: number;
  };
  readonly behavioral: {
    readonly ciFlakeRate: number;
    readonly agentPrAcceptanceRate: number;
    /** null = unverifiable (#5852). */
    readonly agentPrRevertRate: number | null;
    /** null when the eval reading is not current (#5858). */
    readonly evalPassRate: number | null;
    readonly evalMedianScore: number | null;
    /** Absent in metrics.json generated before staleness was tracked. */
    readonly evalsStale?: boolean;
    readonly evalsLastRun?: string | null;
  };
  readonly history: readonly HistoryEntry[];
  /** Absent in metrics.json generated before this field existed. */
  readonly recentAgentChanges?: readonly RecentAgentChange[];
  readonly detectedByLevel: Record<string, number>;
  readonly behavioralGates: readonly BehavioralGate[];
}

/**
 * Gates whose value/threshold are raw counts, not ratios. A threshold of 1 on a
 * count gate means "more than 1 entry" — formatting it as a ratio read as
 * "100.0%" next to a Pass badge (#7581). Mirrors `computeLevel.js` in plugins/acmm.
 */
const COUNT_GATES: ReadonlySet<string> = new Set(["auto-qa-tuning-history"]);

function formatGateNumber(gate: BehavioralGate, n: number): string {
  return !COUNT_GATES.has(gate.name) && n <= 1 ? formatRatio(n) : String(n);
}

function formatEvalPassRate(behavioral: AcmmMetrics["behavioral"]): string {
  const lastRun = behavioral.evalsLastRun;
  // Reuse the page's 14-day freshness window: a reading older than it is stale
  // even if the producer did not null it out.
  if (behavioral.evalPassRate === null || (lastRun && isStale(lastRun))) {
    if (!lastRun) return "No judged runs yet";
    return `Stale — last measured ${formatDate(lastRun)}`;
  }
  return formatRatio(behavioral.evalPassRate);
}

async function fetchMetrics(signal: AbortSignal): Promise<AcmmMetrics> {
  const response = await fetch("/metrics.json", { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as AcmmMetrics;
}

export function MetricsPage() {
  const {
    data: metrics,
    isLoading,
    error,
  } = useQuery<AcmmMetrics>({
    queryKey: ["metrics"],
    queryFn: ({ signal }) => fetchMetrics(signal),
  });

  if (error) {
    return (
      <div className={styles.container}>
        <Heading level={1}>Quality Metrics</Heading>
        <Text className={styles.error}>Error loading metrics: {error.message}</Text>
      </div>
    );
  }

  if (isLoading || !metrics) {
    return (
      <div className={styles.container}>
        <Heading level={1}>Quality Metrics</Heading>
        <div className={styles.loading}>
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  // Older cached metrics.json predates this field — treat it as "nothing shipped yet".
  const recentChanges = metrics.recentAgentChanges ?? [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>Quality Metrics</Heading>
        <Text className={styles.subtitle}>
          AI Codebase Maturity Model — public metrics for mattbutlerengineering
        </Text>
        <DashboardPurpose current="/metrics" />
        <Text className={styles.meta}>
          Last updated: {formatDate(metrics.generatedAt)}
          {" · "}
          <a href="/metrics.json" className={styles.jsonLink}>
            View raw JSON
          </a>
        </Text>
      </header>

      {isStale(metrics.generatedAt) && (
        <Banner variant="warning" className={styles.staleBanner}>
          Stale data — last generated {formatDate(metrics.generatedAt)}, more than 14 days ago. The
          ACMM audit refresher may need attention.
        </Banner>
      )}

      <section className={styles.section}>
        <Heading level={2}>Current Level</Heading>
        <Card className={styles.levelCard}>
          <div className={styles.levelDisplay}>
            <Text className={styles.levelNumber}>{metrics.level}</Text>
            <div className={styles.levelInfo}>
              <Text className={styles.levelName}>{metrics.levelName}</Text>
              <Text className={styles.levelRole}>Role: {metrics.role}</Text>
            </div>
          </div>
          <div className={styles.coverageBar}>
            <div className={styles.coverageLabel}>
              <Text>Detection Coverage</Text>
              <Text>
                {metrics.summary.detected}/{metrics.summary.total} criteria
              </Text>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${metrics.summary.coverage * 100}%` }}
              />
            </div>
          </div>
        </Card>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Behavioral Gates</Heading>
        <div className={styles.gateGrid}>
          {metrics.behavioralGates.map((gate) => (
            <Card key={gate.name} className={styles.gateCard}>
              <div className={styles.gateHeader}>
                <Text className={styles.gateName}>{gate.name.replace(/-/g, " ")}</Text>
                <Badge color={gate.passed ? "green" : "red"} size="sm">
                  {gate.passed ? "Pass" : "Fail"}
                </Badge>
              </div>
              <Text className={styles.gateValue}>
                L{gate.level}: {formatGateNumber(gate, gate.value)} (threshold:{" "}
                {formatGateNumber(gate, gate.threshold)})
              </Text>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Agent Performance</Heading>
        <div className={styles.statGrid}>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>PR Acceptance</Text>
            <Text className={styles.statValue}>
              {formatRatio(metrics.behavioral.agentPrAcceptanceRate)}
            </Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>PR Revert Rate</Text>
            <Text className={styles.statValue}>
              {metrics.behavioral.agentPrRevertRate === null
                ? "Unverifiable"
                : formatRatio(metrics.behavioral.agentPrRevertRate)}
            </Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>CI Flake Rate</Text>
            <Text className={styles.statValue}>{formatRatio(metrics.behavioral.ciFlakeRate)}</Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>Eval Pass Rate</Text>
            <Text className={styles.statValue}>{formatEvalPassRate(metrics.behavioral)}</Text>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Recent AI Changes</Heading>
        {recentChanges.length === 0 ? (
          <Text className={styles.emptyState}>No recent changes to show.</Text>
        ) : (
          <div className={styles.changeList}>
            {recentChanges.map((change) => (
              <Card key={change.number} className={styles.changeCard}>
                <a
                  href={change.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.changeLink}
                >
                  {change.title}
                </a>
                <Text className={styles.changeMeta}>
                  #{change.number} · merged {formatDate(change.mergedAt)}
                </Text>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <Heading level={2}>History</Heading>
        <div className={styles.historyTable}>
          <div className={styles.historyHeader}>
            <Text className={styles.historyCell}>Date</Text>
            <Text className={styles.historyCell}>Level</Text>
            <Text className={styles.historyCell}>Detected</Text>
            <Text className={styles.historyCell}>Total</Text>
          </div>
          {[...metrics.history].reverse().map((entry) => (
            <div key={entry.date} className={styles.historyRow}>
              <Text className={styles.historyCell}>{entry.date}</Text>
              <Text className={styles.historyCell}>{entry.level}</Text>
              <Text className={styles.historyCell}>{entry.detected}</Text>
              <Text className={styles.historyCell}>{entry.total}</Text>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <Heading level={2}>Criteria by Level</Heading>
        <div className={styles.levelBreakdown}>
          {Object.entries(metrics.detectedByLevel).map(([level, count]) => (
            <div key={level} className={styles.levelRow}>
              <Text className={styles.levelLabel}>Level {level}</Text>
              <div className={styles.levelBarTrack}>
                <div
                  className={styles.levelBarFill}
                  style={{ width: `${(count / metrics.summary.total) * 100}%` }}
                />
              </div>
              <Text className={styles.levelCount}>{count}</Text>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
