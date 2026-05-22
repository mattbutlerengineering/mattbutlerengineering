import { useState, useEffect } from "react";
import { Badge, Button, Card, Heading, Spinner, Text } from "@mattbutlerengineering/rialto";
import styles from "./AcmmPage.module.css";

interface BehavioralGate {
  readonly level: number;
  readonly name: string;
  readonly passed: boolean;
  readonly value: number;
  readonly threshold: number;
}

interface WorkspaceEntry {
  readonly name: string;
  readonly path: string;
  readonly type: "app" | "service" | "package";
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
    readonly evalPassRate: number;
  };
  readonly checks: Record<string, { passed: boolean }>;
  readonly behavioralGates: readonly BehavioralGate[];
}

interface AcmmReport {
  readonly schema: string;
  readonly generatedAt: string;
  readonly workspaces: readonly WorkspaceEntry[];
}

const LEVEL_COLORS: Record<number, string> = {
  6: "green",
  5: "green",
  4: "blue",
  3: "blue",
  2: "orange",
  1: "gray",
};

const GROUP_ORDER: Array<WorkspaceEntry["type"]> = ["service", "app", "package"];
const GROUP_LABELS: Record<string, string> = {
  service: "Services",
  app: "Apps",
  package: "Packages",
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

interface WorkspaceCardProps {
  workspace: WorkspaceEntry;
  isExpanded: boolean;
  onToggle: () => void;
}

function WorkspaceCard({ workspace: ws, isExpanded, onToggle }: WorkspaceCardProps) {
  const passCount = Object.values(ws.checks).filter((c) => c.passed).length;
  const failCount = Object.values(ws.checks).filter((c) => !c.passed).length;

  return (
    <Card className={styles.wsCard}>
      <div className={styles.wsHeader}>
        <div className={styles.wsTitle}>
          <Badge color={levelColor(ws.currentLevel)} size="sm">
            L{ws.currentLevel}
          </Badge>
          <Text className={styles.wsName}>{ws.name}</Text>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggle} aria-expanded={isExpanded}>
          {isExpanded ? "▲" : "▼"}
        </Button>
      </div>
      <Text className={styles.wsLevel}>{ws.levelName}</Text>
      <div className={styles.wsCoverage}>
        <div className={styles.coverageLabel}>
          <Text>
            {ws.summary.detected}/{ws.summary.total} criteria
          </Text>
          <Text>{formatPercent(ws.summary.coverage)}</Text>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${ws.summary.coverage * 100}%` }} />
        </div>
      </div>

      {isExpanded && (
        <div className={styles.wsDetails}>
          {ws.behavioralGates.length > 0 && (
            <div className={styles.detailSection}>
              <Text className={styles.detailLabel}>Behavioral Gates</Text>
              <div className={styles.gateList}>
                {ws.behavioralGates.map((gate) => (
                  <div key={gate.name} className={styles.gateRow}>
                    <Badge color={gate.passed ? "green" : "red"} size="sm">
                      {gate.passed ? "Pass" : "Fail"}
                    </Badge>
                    <Text className={styles.gateRowName}>{gate.name.replace(/-/g, " ")}</Text>
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
              {Object.entries(ws.checks).map(([id, check]) => (
                <div key={id} className={styles.criteriaRow}>
                  <Text className={check.passed ? styles.passIcon : styles.failIcon}>
                    {check.passed ? "✓" : "✗"}
                  </Text>
                  <Text className={styles.criteriaId}>
                    {id.replace(/^(?:acmm|fullsend|aef|claude-reflect):/, "")}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function AcmmPage() {
  const [report, setReport] = useState<AcmmReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  function toggleExpanded(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

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

  const byType = Object.fromEntries(
    GROUP_ORDER.map((type) => [
      type,
      [...report.workspaces]
        .filter((w) => w.type === type)
        .sort((a, b) => b.currentLevel - a.currentLevel),
    ])
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Heading level={1}>ACMM Dashboard</Heading>
        <Text className={styles.subtitle}>AI Codebase Maturity Model — all workspaces</Text>
        <Text className={styles.meta}>
          Last updated: {formatDate(report.generatedAt)}
          {" · "}
          <a href="/acmm-report.json" className={styles.jsonLink}>
            View raw JSON
          </a>
        </Text>
      </header>

      {GROUP_ORDER.map((type) => {
        const workspaces = byType[type];
        if (!workspaces?.length) return null;
        return (
          <section key={type} className={styles.section}>
            <Heading level={2}>{GROUP_LABELS[type]}</Heading>
            <div className={styles.workspaceGrid}>
              {workspaces.map((ws) => (
                <WorkspaceCard
                  key={ws.path}
                  workspace={ws}
                  isExpanded={expanded.has(ws.path)}
                  onToggle={() => toggleExpanded(ws.path)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
