import { useState, useEffect } from "react";
import { Card, Badge, Heading, Text, Spinner } from "@mattbutlerengineering/rialto";
import styles from "./MetricsPage.module.css";

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
    readonly agentPrRevertRate: number;
    readonly evalPassRate: number;
    readonly evalMedianScore: number;
  };
  readonly history: readonly HistoryEntry[];
  readonly detectedByLevel: Record<string, number>;
  readonly behavioralGates: readonly BehavioralGate[];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MetricsPage() {
  const [metrics, setMetrics] = useState<AcmmMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/metrics.json");
        if (!response.ok) {
          throw new Error(`Failed to load metrics: ${response.status}`);
        }
        const data: AcmmMetrics = await response.json();
        if (!cancelled) {
          setMetrics(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className={styles.container}>
        <Heading level={1}>Quality Metrics</Heading>
        <Text className={styles.error}>Error loading metrics: {error}</Text>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className={styles.container}>
        <Heading level={1}>Quality Metrics</Heading>
        <div className={styles.loading}>
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>Quality Metrics</Heading>
        <Text className={styles.subtitle}>
          AI Codebase Maturity Model — public metrics for mattbutlerengineering
        </Text>
        <Text className={styles.meta}>
          Last updated: {formatDate(metrics.generatedAt)}
          {" · "}
          <a href="/metrics.json" className={styles.jsonLink}>
            View raw JSON
          </a>
        </Text>
      </header>

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
                L{gate.level}:{" "}
                {typeof gate.value === "number" && gate.value <= 1
                  ? formatPercent(gate.value)
                  : gate.value}{" "}
                (threshold: {gate.threshold <= 1 ? formatPercent(gate.threshold) : gate.threshold})
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
              {formatPercent(metrics.behavioral.agentPrAcceptanceRate)}
            </Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>PR Revert Rate</Text>
            <Text className={styles.statValue}>
              {formatPercent(metrics.behavioral.agentPrRevertRate)}
            </Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>CI Flake Rate</Text>
            <Text className={styles.statValue}>
              {formatPercent(metrics.behavioral.ciFlakeRate)}
            </Text>
          </Card>
          <Card className={styles.statCard}>
            <Text className={styles.statLabel}>Eval Pass Rate</Text>
            <Text className={styles.statValue}>
              {formatPercent(metrics.behavioral.evalPassRate)}
            </Text>
          </Card>
        </div>
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
