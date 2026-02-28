import { DataList, Select, Spinner, Stack, Text } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type SpinnerSize = "sm" | "md" | "lg";

function SpinnerPlayground() {
  const [size, setSize] = useState<SpinnerSize>("md");
  const [label, setLabel] = useState("Loading data...");
  const [showLabel, setShowLabel] = useState(true);

  return (
    <Stack gap="lg">
      <div style={{ display: "flex", justifyContent: "center", padding: "var(--rialto-space-xl)" }}>
        <Spinner size={size} label={showLabel ? label : undefined} />
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as SpinnerSize)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-xs)" }}>
          <label
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              fontWeight: "var(--rialto-weight-medium)",
            }}
          >
            Label text
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            style={{
              padding: "var(--rialto-space-xs) var(--rialto-space-sm)",
              border: "1px solid var(--rialto-border)",
              borderRadius: "var(--rialto-radius-default)",
              background: "var(--rialto-surface-recessed)",
              color: "var(--rialto-text-primary)",
              fontSize: "var(--rialto-text-sm)",
              fontFamily: "var(--rialto-font-sans)",
            }}
          />
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--rialto-space-xs)",
            fontSize: "var(--rialto-text-sm)",
            color: "var(--rialto-text-secondary)",
            cursor: "pointer",
            marginTop: "auto",
          }}
        >
          <input
            type="checkbox"
            checked={showLabel}
            onChange={(e) => setShowLabel(e.target.checked)}
          />
          Show label
        </label>
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SpinnerPage() {
  return (
    <ComponentPageLayout
      name="Spinner"
      description="Orbital ring with gold arc sweep — the AI-ready loading indicator. Three sizes for different contexts. Optional visible label for extended loading states."
    >
      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.row} style={{ alignItems: "center", justifyContent: "flex-start" }}>
          <div className={styles.stack} style={{ alignItems: "center" }}>
            <Spinner size="sm" />
            <Text variant="detail" color="tertiary">
              sm
            </Text>
          </div>
          <div className={styles.stack} style={{ alignItems: "center" }}>
            <Spinner size="md" />
            <Text variant="detail" color="tertiary">
              md
            </Text>
          </div>
          <div className={styles.stack} style={{ alignItems: "center" }}>
            <Spinner size="lg" />
            <Text variant="detail" color="tertiary">
              lg
            </Text>
          </div>
        </div>
      </Section>

      {/* ── With Label ────────────────────────────────────────────── */}
      <Section title="With Label">
        <div className={styles.row} style={{ flexWrap: "wrap", alignItems: "center" }}>
          <Spinner size="sm" label="Loading..." />
          <Spinner size="md" label="Syncing telemetry..." />
          <Spinner size="lg" label="Processing session data..." />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Examples">
        <Stack gap="md">
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
              display: "flex",
              alignItems: "center",
              gap: "var(--rialto-space-sm)",
            }}
          >
            <Spinner size="sm" />
            <Text variant="body" color="secondary">
              Uploading telemetry data...
            </Text>
          </div>
          <div
            style={{
              padding: "var(--rialto-space-xl)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--rialto-space-md)",
            }}
          >
            <Spinner size="lg" />
            <Text variant="caption" color="secondary">
              AI analysis in progress
            </Text>
          </div>
        </Stack>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────── */}
      <Section title="Interactive Playground">
        <SpinnerPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "size",
              type: '"sm" | "md" | "lg"',
              default: '"md"',
              description: "Size of the spinner ring.",
            },
            {
              name: "label",
              type: "string",
              description: "Screen reader text and optional visible label below the spinner.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=status" },
            { label: "Label", value: "aria-label provided via the label prop" },
            { label: "Reduced motion", value: "Spin animation disabled via prefers-reduced-motion" },
            { label: "Screen reader", value: "Announces loading state when rendered" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SpinnerPage.displayName = "SpinnerPage";
