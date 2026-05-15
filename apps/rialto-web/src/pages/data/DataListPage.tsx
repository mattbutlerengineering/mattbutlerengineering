import { Checkbox, DataList, Select } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type DataListOrientation = "vertical" | "horizontal";

function DataListPlayground() {
  const [orientation, setOrientation] = useState<DataListOrientation>("vertical");
  const [striped, setStriped] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-lg)" }}>
      <DataList
        orientation={orientation}
        striped={striped}
        items={[
          { label: "Engine", value: "Twin-turbo 3.0L V6 Hybrid" },
          { label: "Power", value: "1,200 PS" },
          { label: "Torque", value: "900 Nm" },
          { label: "Weight", value: "1,250 kg" },
          { label: "0–100 km/h", value: "2.15s" },
        ]}
      />
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Orientation"
          value={orientation}
          onChange={(v) => setOrientation(v as DataListOrientation)}
          options={[
            { value: "vertical", label: "vertical" },
            { value: "horizontal", label: "horizontal" },
          ]}
        />
        <Checkbox label="Striped" checked={striped} onCheckedChange={setStriped} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DataListPage() {
  return (
    <ComponentPageLayout
      name="Data List"
      description="Semantic key-value pairs using native dl/dt/dd elements. Horizontal or vertical layout with optional striped rows for dense data."
    >
      {/* ── Vertical ──────────────────────────────────────────────── */}
      <Section title="Vertical (default)">
        <DataList
          items={[
            { label: "Engine", value: "Twin-turbo 3.0L V6 Hybrid" },
            { label: "Power", value: "1,200 PS" },
            { label: "Torque", value: "900 Nm" },
            { label: "Weight", value: "1,250 kg" },
            { label: "0–100 km/h", value: "2.15s" },
            { label: "Top Speed", value: "350 km/h" },
          ]}
        />
      </Section>

      {/* ── Horizontal ────────────────────────────────────────────── */}
      <Section title="Horizontal with Striped Rows">
        <DataList
          orientation="horizontal"
          striped
          items={[
            { label: "Session", value: "FP1 — Fiorano" },
            { label: "Ambient Temp", value: "22°C" },
            { label: "Track Temp", value: "38°C" },
            { label: "Humidity", value: "45%" },
            { label: "Wind", value: "12 km/h NNW" },
          ]}
        />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "var(--rialto-space-lg)",
          }}
        >
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
            }}
          >
            <p
              style={{
                fontSize: "var(--rialto-text-xs)",
                color: "var(--rialto-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "var(--rialto-tracking-wide)",
                marginBottom: "var(--rialto-space-md)",
              }}
            >
              Car Specifications
            </p>
            <DataList
              items={[
                { label: "Chassis", value: "Ferrari F80" },
                { label: "Engine", value: "Twin-turbo V6 Hybrid" },
                { label: "Power", value: "1,200 PS" },
                { label: "Weight", value: "1,250 kg" },
              ]}
            />
          </div>
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
            }}
          >
            <p
              style={{
                fontSize: "var(--rialto-text-xs)",
                color: "var(--rialto-text-tertiary)",
                textTransform: "uppercase",
                letterSpacing: "var(--rialto-tracking-wide)",
                marginBottom: "var(--rialto-space-md)",
              }}
            >
              Track Conditions
            </p>
            <DataList
              orientation="horizontal"
              striped
              items={[
                { label: "Ambient", value: "22°C" },
                { label: "Track", value: "38°C" },
                { label: "Humidity", value: "45%" },
                { label: "Wind", value: "12 km/h NNW" },
              ]}
            />
          </div>
        </div>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <DataListPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "items",
              type: "Array<{ label: string; value: ReactNode }>",
              description: "Key-value pairs to display.",
            },
            {
              name: "orientation",
              type: '"vertical" | "horizontal"',
              default: '"vertical"',
              description: "Layout direction. Horizontal places label and value side by side.",
            },
            {
              name: "striped",
              type: "boolean",
              default: "false",
              description: "Alternating row background for dense lists.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <dl> with <dt> and <dd> semantics" },
            { label: "Screen readers", value: "Term/description pairs announced correctly" },
            {
              label: "Visual grouping",
              value: "Striped rows are purely visual — no semantic meaning",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

DataListPage.displayName = "DataListPage";
