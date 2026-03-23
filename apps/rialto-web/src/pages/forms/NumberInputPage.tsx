import { useState } from "react";
import { Button, Card, Checkbox, DataList, NumberInput, Select, Stack, Text } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type NumberInputSize = "small" | "large";

function NumberInputPlayground() {
  const [value, setValue] = useState(42);
  const [size, setSize] = useState<NumberInputSize>("large");
  const [error, setError] = useState(false);
  const [disabled, setDisabled] = useState(false);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <NumberInput
          label="Value"
          value={value}
          onChange={setValue}
          min={0}
          max={100}
          step={1}
          size={size}
          error={error}
          hint={error ? "Out of valid range" : "Range: 0–100, step: 1"}
          disabled={disabled}
        />
      </Card>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as NumberInputSize)}
          options={[
            { value: "small", label: "small" },
            { value: "large", label: "large" },
          ]}
        />
        <Checkbox label="Error" checked={error} onCheckedChange={setError} />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function NumberInputPage() {
  const [lapCount, setLapCount] = useState(5);
  const [fuelMix, setFuelMix] = useState(3);
  const [brakeBias, setBrakeBias] = useState(56);

  return (
    <ComponentPageLayout
      name="Number Input"
      description="A precision stepper with machined +/- buttons. Hold to repeat with acceleration. Arrow keys for keyboard control. Monospace digits in a recessed channel — like adjusting a physical dial."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <div className={styles.row} style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
          <NumberInput
            label="Lap Count"
            value={lapCount}
            onChange={setLapCount}
            min={1}
            max={99}
            hint="1–99 laps"
          />
          <NumberInput
            label="Fuel Mix"
            value={fuelMix}
            onChange={setFuelMix}
            min={1}
            max={10}
            step={1}
            hint="Engine mapping mode"
          />
          <NumberInput
            label="Brake Bias %"
            value={brakeBias}
            onChange={setBrakeBias}
            min={50}
            max={65}
            step={0.5}
          />
        </div>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.row} style={{ alignItems: "flex-end" }}>
          <NumberInput label="Small" value={7} onChange={() => {}} size="small" />
          <NumberInput label="Large" value={42} onChange={() => {}} size="large" />
        </div>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <div className={styles.row} style={{ alignItems: "flex-end" }}>
          <NumberInput label="Default" value={42} onChange={() => {}} />
          <NumberInput
            label="Error"
            value={0}
            onChange={() => {}}
            error
            hint="Out of valid range"
          />
          <NumberInput label="Disabled" value={42} onChange={() => {}} disabled />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Pit Strategy Settings
            </Text>
            <div className={styles.row} style={{ flexWrap: "wrap", alignItems: "flex-end" }}>
              <NumberInput
                label="Target Lap"
                value={14}
                onChange={() => {}}
                min={1}
                max={78}
                hint="Planned pit entry lap"
              />
              <NumberInput
                label="Fuel Load (kg)"
                value={45}
                onChange={() => {}}
                min={0}
                max={110}
                step={0.5}
                hint="Race fuel load"
              />
            </div>
            <div className={styles.row} style={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm">
                Reset
              </Button>
              <Button variant="primary" size="sm">
                Confirm Strategy
              </Button>
            </div>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <NumberInputPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "label",
              type: "string",
              description: "Label text above the field.",
            },
            {
              name: "value",
              type: "number",
              description: "Controlled numeric value.",
            },
            {
              name: "onChange",
              type: "(value: number) => void",
              description: "Called when value changes.",
            },
            {
              name: "min",
              type: "number",
              description: "Minimum allowed value.",
            },
            {
              name: "max",
              type: "number",
              description: "Maximum allowed value.",
            },
            {
              name: "step",
              type: "number",
              default: "1",
              description: "Increment/decrement amount.",
            },
            {
              name: "size",
              type: '"small" | "large"',
              default: '"large"',
              description: "Visual size of the input.",
            },
            {
              name: "hint",
              type: "string",
              description: "Helper text below the field.",
            },
            {
              name: "error",
              type: "boolean",
              default: "false",
              description: "Shows error styling.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Disables the input.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <input type=number>" },
            { label: "Keyboard", value: "Arrow Up/Down to increment/decrement" },
            { label: "Keyboard", value: "Hold stepper buttons for accelerating repeat" },
            { label: "Focus", value: "Gold glow ring on focus-visible" },
            { label: "Range", value: "aria-valuemin, aria-valuemax communicated" },
            {
              label: "Screen reader",
              value:
                "Announces label + current value + 'stepper'; increment/decrement buttons announced; value change announced on step",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

NumberInputPage.displayName = "NumberInputPage";
