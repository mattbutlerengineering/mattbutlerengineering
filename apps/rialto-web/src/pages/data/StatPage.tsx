import { Card, DataList, Select, Stack, Stat } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type StatSize = "sm" | "md" | "lg";
type StatTrend = "up" | "down" | "neutral";

function StatPlayground() {
  const [size, setSize] = useState<StatSize>("md");
  const [trend, setTrend] = useState<StatTrend>("up");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-lg)" }}>
      <div style={{ maxWidth: 200 }}>
        <Stat
          value="1:25.410"
          label="Lap Time"
          delta="-0.342"
          trend={trend}
          size={size}
        />
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as StatSize)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
        <Select
          label="Trend"
          value={trend}
          onChange={(v) => setTrend(v as StatTrend)}
          options={[
            { value: "up", label: "up" },
            { value: "down", label: "down" },
            { value: "neutral", label: "neutral" },
          ]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function StatPage() {
  return (
    <ComponentPageLayout
      name="Stat"
      description="Dashboard metric readout. Monospace value display on an aluminum surface — like a precision instrument. Trend arrows with color-coded deltas."
    >
      {/* ── Dashboard Grid ────────────────────────────────────────── */}
      <Section title="Dashboard Grid">
        <div className={styles.cardGrid}>
          <Stat value="1:25.410" label="Lap Time" delta="-0.342" trend="up" />
          <Stat value="342 km/h" label="Top Speed" delta="+3" trend="up" />
          <Stat value="47%" label="Fuel" delta="-8%" trend="down" />
          <Stat value="23%" label="Brake Wear" delta="0.0%" trend="neutral" />
        </div>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack direction="row" gap="sm" align="start" wrap>
          <Stat value="1:25" label="Small" size="sm" />
          <Stat value="1:25.410" label="Medium" />
          <Stat value="1:25.410" label="Large" size="lg" />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <p
            style={{
              fontSize: "var(--rialto-text-xs)",
              fontWeight: "var(--rialto-weight-medium)",
              color: "var(--rialto-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "var(--rialto-tracking-wide)",
              marginBottom: "var(--rialto-space-md)",
            }}
          >
            Session Overview — Fiorano FP1
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "var(--rialto-space-lg)",
            }}
          >
            <Stat value="1:25.410" label="Best Lap" delta="-0.342" trend="up" />
            <Stat value="42" label="Laps Completed" />
            <Stat value="87%" label="Fuel Used" delta="-5%" trend="neutral" />
            <Stat value="338 km/h" label="Top Speed" delta="+7" trend="up" />
          </div>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <StatPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "value",
              type: "string",
              description: "Primary metric value (displayed in monospace).",
            },
            {
              name: "label",
              type: "string",
              description: "Descriptive label below the value.",
            },
            {
              name: "delta",
              type: "string",
              description: "Change amount shown with trend arrow.",
            },
            {
              name: "trend",
              type: '"up" | "down" | "neutral"',
              description: "Direction arrow and color: up=success, down=error, neutral=tertiary.",
            },
            {
              name: "size",
              type: '"sm" | "md" | "lg"',
              default: '"md"',
              description: "Visual size of the stat.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<dl> with <dt> label and <dd> value" },
            { label: "Delta", value: "Trend direction communicated via aria-label on icon" },
            { label: "Monospace", value: "Values use var(--rialto-font-mono) for digit alignment" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

StatPage.displayName = "StatPage";
