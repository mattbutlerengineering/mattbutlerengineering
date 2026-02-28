import { Checkbox, DataList, Meter, Select } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type MeterVariant = "default" | "accent" | "success" | "error";
type MeterSize = "sm" | "md";

function MeterPlayground() {
  const [value, setValue] = useState(65);
  const [variant, setVariant] = useState<MeterVariant>("accent");
  const [size, setSize] = useState<MeterSize>("md");
  const [showValue, setShowValue] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-lg)" }}>
      <Meter
        value={value}
        label="Current reading"
        showValue={showValue}
        variant={variant}
        size={size}
      />
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Variant"
          value={variant}
          onChange={(v) => setVariant(v as MeterVariant)}
          options={[
            { value: "default", label: "default" },
            { value: "accent", label: "accent" },
            { value: "success", label: "success" },
            { value: "error", label: "error" },
          ]}
        />
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as MeterSize)}
          options={[
            { value: "md", label: "md" },
            { value: "sm", label: "sm" },
          ]}
        />
        <Checkbox label="Show value" checked={showValue} onCheckedChange={setShowValue} />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        style={{ width: "100%" }}
        aria-label="Adjust meter value"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function MeterPage() {
  return (
    <ComponentPageLayout
      name="Meter"
      description="A bounded gauge for current values within a known range. Unlike Progress (which tracks completion), Meter shows a reading — fuel level, brake temperature, tire pressure."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.stack}>
          <Meter value={72} label="Fuel Level" showValue variant="accent" />
          <Meter value={88} label="Brake Temperature" showValue variant="error" />
          <Meter value={32} label="Tire Pressure" showValue variant="success" />
          <Meter value={56} label="Engine Load" showValue variant="default" />
        </div>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.stack}>
          <Meter value={65} label="Medium (default)" showValue variant="accent" />
          <Meter value={65} label="Small" showValue size="sm" variant="accent" />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
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
              marginBottom: "var(--rialto-space-lg)",
            }}
          >
            System Status
          </p>
          <div className={styles.stack}>
            <Meter value={72} label="Fuel" showValue size="sm" variant="accent" />
            <Meter value={88} label="Brake Temp" showValue size="sm" variant="error" />
            <Meter value={45} label="Tyre Wear" showValue size="sm" variant="default" />
            <Meter value={94} label="ERS Deploy" showValue size="sm" variant="success" />
          </div>
        </div>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <MeterPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "value",
              type: "number",
              description: "Current value (within min–max range).",
            },
            {
              name: "min",
              type: "number",
              default: "0",
              description: "Minimum of the range.",
            },
            {
              name: "max",
              type: "number",
              default: "100",
              description: "Maximum of the range.",
            },
            {
              name: "label",
              type: "string",
              description: "Descriptive label for the meter.",
            },
            {
              name: "showValue",
              type: "boolean",
              default: "false",
              description: "Shows the numeric value beside the label.",
            },
            {
              name: "variant",
              type: '"default" | "accent" | "success" | "error"',
              default: '"default"',
              description: "Color of the filled track.",
            },
            {
              name: "size",
              type: '"sm" | "md"',
              default: '"md"',
              description: "Height of the meter track.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <meter> element" },
            { label: "Value", value: "aria-valuenow, aria-valuemin, aria-valuemax" },
            { label: "Label", value: "aria-label from the label prop" },
            { label: "Semantics", value: "Distinguishable from Progress (completion) — Meter is a reading" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

MeterPage.displayName = "MeterPage";
