import { Checkbox, DataList, RadialGauge, Select, Slider } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "./RadialGaugePage.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type GaugeSize = "sm" | "md" | "lg";

function RadialGaugePlayground() {
  const [value, setValue] = useState(72);
  const [size, setSize] = useState<GaugeSize>("md");
  const [needle, setNeedle] = useState(true);
  const [showValue, setShowValue] = useState(true);

  return (
    <div className={styles.playground}>
      <RadialGauge
        value={value}
        label="Current reading"
        unit="%"
        size={size}
        needle={needle}
        showValue={showValue}
        thresholds={[{ value: 90, tone: "error", label: "Redline" }]}
      />
      <div className={styles.sliderWrap}>
        <Slider
          label="Value"
          min={0}
          max={100}
          value={value}
          onChange={setValue}
          showValue
          formatValue={(v) => `${v}%`}
        />
      </div>
      <div className={styles.controls}>
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as GaugeSize)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
        <Checkbox label="Needle" checked={needle} onCheckedChange={setNeedle} />
        <Checkbox label="Show value" checked={showValue} onCheckedChange={setShowValue} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function RadialGaugePage() {
  return (
    <ComponentPageLayout
      name="RadialGauge"
      description="An analog instrument dial for a bounded metric (utilization, score, capacity) — the instrument-panel counterpart to Meter. A gold accent arc fills over an aluminium track with an optional pointer needle and threshold markers."
    >
      {/* ── Examples ──────────────────────────────────────────────── */}
      <Section title="Examples">
        <div className={styles.gaugeGrid}>
          <RadialGauge value={72} label="Utilization" unit="%" />
          <RadialGauge
            value={4.2}
            min={0}
            max={5}
            label="Score"
            thresholds={[{ value: 4.5, tone: "success" }]}
          />
          <RadialGauge
            value={88}
            label="Capacity"
            unit="%"
            thresholds={[{ value: 90, tone: "error", label: "Limit" }]}
          />
        </div>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.gaugeGrid}>
          <RadialGauge value={65} label="Small" unit="%" size="sm" />
          <RadialGauge value={65} label="Medium" unit="%" size="md" />
          <RadialGauge value={65} label="Large" unit="%" size="lg" />
        </div>
      </Section>

      {/* ── Needle & readout ──────────────────────────────────────── */}
      <Section title="Needle & readout">
        <div className={styles.gaugeGrid}>
          <RadialGauge value={42} label="With needle" unit="%" />
          <RadialGauge value={42} label="No needle" unit="%" needle={false} />
          <RadialGauge value={42} label="Arc only" needle={false} showValue={false} />
        </div>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <RadialGaugePlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="RadialGauge" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=meter" },
            { label: "Value", value: "aria-valuenow, aria-valuemin, aria-valuemax" },
            { label: "Label", value: "aria-label from the label prop" },
            {
              label: "Status",
              value: "Needle position and numeric readout — never colour-only",
            },
            { label: "Motion", value: "Fill transition disabled under prefers-reduced-motion" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

RadialGaugePage.displayName = "RadialGaugePage";
