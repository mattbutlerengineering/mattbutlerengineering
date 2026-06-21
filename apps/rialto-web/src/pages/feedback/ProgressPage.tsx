import {
  Checkbox,
  DataList,
  Progress,
  Select,
  Spinner,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type ProgressSize = "sm" | "md";

function ProgressPlayground() {
  const [value, setValue] = useState(72);
  const [size, setSize] = useState<ProgressSize>("md");
  const [showValue, setShowValue] = useState(true);
  const [indeterminate, setIndeterminate] = useState(false);

  return (
    <Stack gap="lg">
      <Progress
        value={indeterminate ? undefined : value}
        label="Upload progress"
        showValue={showValue}
        size={size}
      />
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as ProgressSize)}
          options={[
            { value: "md", label: "md" },
            { value: "sm", label: "sm" },
          ]}
        />
        <Checkbox label="Show value" checked={showValue} onCheckedChange={setShowValue} />
        <Checkbox
          label="Indeterminate"
          checked={indeterminate}
          onCheckedChange={setIndeterminate}
        />
      </div>
      {!indeterminate && (
        // eslint-disable-next-line mbe-local/prefer-rialto-components
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          style={{ width: "100%" }}
          aria-label="Adjust progress value"
        />
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProgressPage() {
  return (
    <ComponentPageLayout
      name="Progress"
      description="Gold accent fill advancing through an aluminum channel. Determinate bar for known values, indeterminate shimmer for unknown, orbital spinner for AI-ready loading."
    >
      {/* ── Progress Bar ──────────────────────────────────────────── */}
      <Section title="Progress Bar">
        <div className={styles.stack}>
          <Progress value={72} label="Telemetry upload" showValue />
          <Progress value={35} label="Diagnostics" showValue size="sm" />
          <Progress label="Processing…" />
          <Progress value={100} label="Complete" showValue />
        </div>
      </Section>

      {/* ── Spinner ───────────────────────────────────────────────── */}
      <Section title="Spinner">
        <div className={styles.row} style={{ alignItems: "center" }}>
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

      {/* ── Spinner with Label ────────────────────────────────────── */}
      <Section title="Spinner with Label">
        <div className={styles.row}>
          <Spinner size="md" label="Loading data..." />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
            }}
          >
            <Text
              variant="label"
              color="primary"
              style={{ marginBottom: "var(--rialto-space-md)" }}
            >
              Session Upload
            </Text>
            <Stack gap="sm">
              <Progress value={100} label="Telemetry data" showValue />
              <Progress value={68} label="Video footage" showValue />
              <Progress label="Processing channels…" />
            </Stack>
          </div>
        </Stack>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <ProgressPlayground />
      </Section>

      {/* ── Props Table (Progress) ────────────────────────────────── */}
      <Section title="Progress Props">
        <PropsTable component="Progress" />
      </Section>

      {/* ── Props Table (Spinner) ─────────────────────────────────── */}
      <Section title="Spinner Props">
        <PropsTable component="Spinner" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Progress element", value: "Native <progress> element" },
            { label: "Value", value: "aria-valuenow, aria-valuemin, aria-valuemax" },
            { label: "Indeterminate", value: "aria-busy=true when value is undefined" },
            { label: "Spinner", value: "role=status with aria-label" },
            { label: "Reduced motion", value: "Shimmer and spin animations disabled" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ProgressPage.displayName = "ProgressPage";
