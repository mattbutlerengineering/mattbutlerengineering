import { useState, useEffect } from "react";
import { Badge, Button, Card, Heading, Spinner, Text } from "@mattbutlerengineering/rialto";
import styles from "./AcmmPage.module.css";

interface BehavioralGate {
  readonly level: number;
  readonly name: string;
  readonly passed: boolean;
  readonly value: number | null;
  readonly threshold: number;
  readonly unverifiable: boolean;
}

interface RepoEntry {
  readonly currentLevel: number;
  readonly levelName: string;
  readonly role: string;
  readonly lastRun: string | null;
  readonly summary: {
    readonly detected: number;
    readonly total: number;
    readonly coverage: number;
  };
  readonly behavioral: {
    readonly ciFlakeRate: number;
    readonly agentPrAcceptanceRate: number;
    readonly agentPrRevertRate: number;
    readonly evalPassRate: number | null;
    readonly evalsStale: boolean;
    readonly evalsLastRun: string | null;
  };
  readonly checks: Record<string, { passed: boolean }>;
  readonly behavioralGates: readonly BehavioralGate[];
}

interface AcmmReport {
  readonly schema: string;
  readonly generatedAt: string;
  readonly repo: RepoEntry;
}

const LEVEL_COLORS: Record<number, string> = {
  6: "green",
  5: "green",
  4: "blue",
  3: "blue",
  2: "orange",
  1: "gray",
};

function levelColor(level: number): string {
  return LEVEL_COLORS[level] ?? "gray";
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

/** Trims a gate's raw number to 2 decimal places without trailing zeros. */
function formatGateNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

function EvalsSummary({ behavioral }: { behavioral: RepoEntry["behavioral"] }) {
  if (behavioral.evalsStale) {
    return (
      <Text>
        Agent evals: not measured{" "}
        {behavioral.evalsLastRun ? `since ${formatDate(behavioral.evalsLastRun)}` : "yet"}
      </Text>
    );
  }
  return <Text>Agent evals: {formatPercent(behavioral.evalPassRate ?? 0)} pass</Text>;
}

export function AcmmPage() {
  const [report, setReport] = useState<AcmmReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/acmm-report.json");
        if (!response.ok) {
          throw new Error(`Failed to load report: ${response.status}`);
        }
        const data: AcmmReport = await response.json();
        if (!cancelled) setReport(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
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
        <Heading level={1}>ACMM Dashboard</Heading>
        <Text className={styles.error}>Error loading report: {error}</Text>
      </div>
    );
  }

  if (!report) {
    return (
      <div className={styles.container}>
        <Heading level={1}>ACMM Dashboard</Heading>
        <div className={styles.loading}>
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  const { repo } = report;
  const passCount = Object.values(repo.checks).filter((c) => c.passed).length;
  const failCount = Object.values(repo.checks).filter((c) => !c.passed).length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>ACMM Dashboard</Heading>
        <Text className={styles.subtitle}>AI Codebase Maturity Model — repo-level audit</Text>
        <Text className={styles.meta}>
          Audited {repo.lastRun ? formatDate(repo.lastRun) : "date unknown"}
          {" · "}
          <a href="/acmm-report.json" className={styles.jsonLink}>
            View raw JSON
          </a>
        </Text>
      </header>

      <Card className={styles.wsCard}>
        <div className={styles.wsHeader}>
          <div className={styles.wsTitle}>
            <Badge color={levelColor(repo.currentLevel)} size="sm">
              L{repo.currentLevel}
            </Badge>
            <Text className={styles.wsName}>{repo.levelName}</Text>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
          >
            {expanded ? "▲" : "▼"}
          </Button>
        </div>
        {repo.role && <Text className={styles.wsLevel}>{repo.role}</Text>}
        <div className={styles.wsCoverage}>
          <div className={styles.coverageLabel}>
            <Text>
              {repo.summary.detected}/{repo.summary.total} criteria
            </Text>
            <Text>{formatPercent(repo.summary.coverage)}</Text>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${repo.summary.coverage * 100}%` }}
            />
          </div>
        </div>
        <div className={styles.detailSection}>
          <EvalsSummary behavioral={repo.behavioral} />
        </div>

        {expanded && (
          <div className={styles.wsDetails}>
            {repo.behavioralGates.length > 0 && (
              <div className={styles.detailSection}>
                <Text className={styles.detailLabel}>Behavioral Gates</Text>
                <div className={styles.gateList}>
                  {repo.behavioralGates.map((gate) => (
                    <div key={gate.name} className={styles.gateRow}>
                      <Badge
                        color={gate.unverifiable ? "gray" : gate.passed ? "green" : "red"}
                        size="sm"
                      >
                        {gate.unverifiable ? "Unverifiable" : gate.passed ? "Pass" : "Fail"}
                      </Badge>
                      <Text className={styles.gateRowName}>{gate.name.replace(/-/g, " ")}</Text>
                      <Text className={styles.gateRowValue}>
                        {gate.value === null ? "—" : formatGateNumber(gate.value)} /{" "}
                        {formatGateNumber(gate.threshold)}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.detailSection}>
              <Text className={styles.detailLabel}>
                Criteria — {passCount} pass / {failCount} fail
              </Text>
              <div className={styles.criteriaList}>
                {Object.entries(repo.checks).map(([id, check]) => (
                  <div key={id} className={styles.criteriaRow}>
                    <Text className={check.passed ? styles.passIcon : styles.failIcon}>
                      {check.passed ? "✓" : "✗"}
                    </Text>
                    <Text className={styles.criteriaId}>
                      {id.replace(/^(?:acmm|fullsend|aef|claude-reflect|meta):/, "")}
                    </Text>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
