import { useState } from "react";
import { Card, Checkbox, DataList, Select, Slider, Stack } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function SliderPlayground() {
  const [value, setValue] = useState(50);
  const [showValue, setShowValue] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [formatType, setFormatType] = useState("percent");

  const formatValue =
    formatType === "percent"
      ? (v: number) => `${v}%`
      : formatType === "kg"
        ? (v: number) => `${v} kg`
        : undefined;

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <Slider
          label="Value"
          value={value}
          onChange={setValue}
          min={0}
          max={100}
          step={1}
          showValue={showValue}
          formatValue={formatValue}
          disabled={disabled}
        />
      </Card>
      <div className={styles.row}>
        <Select
          label="Format"
          value={formatType}
          onChange={setFormatType}
          options={[
            { value: "percent", label: "Percent (%)" },
            { value: "kg", label: "Kilograms (kg)" },
            { value: "none", label: "No format" },
          ]}
        />
        <Checkbox label="Show value" checked={showValue} onCheckedChange={setShowValue} />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SliderPage() {
  const [throttle, setThrottle] = useState(72);
  const [downforce, setDownforce] = useState(650);

  return (
    <ComponentPageLayout
      name="Slider"
      description="Gold knob on a recessed aluminum track. Drag for immediate response — release and the knob settles with spring physics. The continuous-value counterpart to Toggle."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <div className={styles.stack}>
          <Slider
            label="Throttle Response"
            value={throttle}
            onChange={setThrottle}
            showValue
            formatValue={(v) => `${v}%`}
          />
          <Slider
            label="Downforce"
            min={200}
            max={1000}
            step={50}
            value={downforce}
            onChange={setDownforce}
            showValue
            formatValue={(v) => `${v} kg`}
          />
        </div>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <div className={styles.stack}>
          <Slider label="Default" defaultValue={30} />
          <Slider
            label="With value display"
            defaultValue={65}
            showValue
            formatValue={(v) => `${v}%`}
          />
          <Slider label="Disabled" defaultValue={40} disabled />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="lg">
            <Slider
              label="Engine power limit"
              min={50}
              max={100}
              step={5}
              defaultValue={100}
              showValue
              formatValue={(v) => `${v}%`}
            />
            <Slider
              label="Regenerative braking"
              min={0}
              max={10}
              step={1}
              defaultValue={6}
              showValue
            />
            <Slider
              label="Ride height (mm)"
              min={30}
              max={80}
              step={2}
              defaultValue={50}
              showValue
              formatValue={(v) => `${v}mm`}
            />
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <SliderPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Slider" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=slider" },
            { label: "State", value: "aria-valuenow, aria-valuemin, aria-valuemax" },
            { label: "Keyboard", value: "Arrow Left/Right to decrement/increment" },
            { label: "Keyboard", value: "Home/End jump to min/max" },
            { label: "Focus", value: "Gold glow ring on focus-visible on the thumb" },
            {
              label: "Screen reader",
              value:
                "Announces label + current value + 'slider'; value changes announced on arrow key press; min/max range announced on focus",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SliderPage.displayName = "SliderPage";
