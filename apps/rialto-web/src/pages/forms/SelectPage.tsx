import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataList,
  Select,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function SelectPlayground() {
  const [value, setValue] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [hasPlaceholder, setHasPlaceholder] = useState(true);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <Select
          label="Driving Mode"
          placeholder={hasPlaceholder ? "Choose mode…" : undefined}
          value={value}
          onChange={setValue}
          disabled={disabled}
          options={[
            { value: "comfort", label: "Comfort" },
            { value: "sport", label: "Sport" },
            { value: "race", label: "Race" },
            { value: "wet", label: "Wet" },
            { value: "esc-off", label: "ESC Off", disabled: true },
          ]}
        />
      </Card>
      <div className={styles.row}>
        <Checkbox
          label="Show placeholder"
          checked={hasPlaceholder}
          onCheckedChange={setHasPlaceholder}
        />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
      {value && (
        <Text variant="caption" color="secondary">
          Selected: <strong>{value}</strong>
        </Text>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SelectPage() {
  const [drivingMode, setDrivingMode] = useState("");

  return (
    <ComponentPageLayout
      name="Select"
      description="Aluminum trigger opening into a frosted glass dropdown. Spring entrance, gold check marks, full keyboard navigation — Arrow, Home, End, Escape, type-ahead."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <Stack direction="row" gap="sm" align="end" wrap>
          <Select
            label="Driving Mode"
            placeholder="Choose mode…"
            value={drivingMode}
            onChange={setDrivingMode}
            options={[
              { value: "comfort", label: "Comfort" },
              { value: "sport", label: "Sport" },
              { value: "race", label: "Race" },
              { value: "wet", label: "Wet" },
              { value: "esc-off", label: "ESC Off", disabled: true },
            ]}
          />
          <Select
            label="Tyre Compound"
            placeholder="Select compound…"
            options={[
              { value: "soft", label: "Soft (C5)" },
              { value: "medium", label: "Medium (C3)" },
              { value: "hard", label: "Hard (C1)" },
              { value: "inter", label: "Intermediate" },
              { value: "wet", label: "Full Wet" },
            ]}
          />
        </Stack>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack direction="row" gap="sm" align="end" wrap>
          <Select
            label="With value"
            value="sport"
            onChange={() => {}}
            options={[
              { value: "comfort", label: "Comfort" },
              { value: "sport", label: "Sport" },
              { value: "race", label: "Race" },
            ]}
          />
          <Select
            label="Disabled"
            placeholder="Not available"
            disabled
            options={[{ value: "x", label: "x" }]}
          />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Race Strategy
            </Text>
            <Stack direction="row" gap="sm" align="end" wrap>
              <Select
                label="Starting tyre"
                placeholder="Select compound…"
                options={[
                  { value: "soft", label: "Soft (C5)" },
                  { value: "medium", label: "Medium (C3)" },
                  { value: "hard", label: "Hard (C1)" },
                ]}
              />
              <Select
                label="Pit window"
                placeholder="Select lap…"
                options={[
                  { value: "10", label: "Lap 10–15" },
                  { value: "20", label: "Lap 20–25" },
                  { value: "30", label: "Lap 30–35" },
                ]}
              />
            </Stack>
            <Stack direction="row" gap="sm" align="center" justify="end" wrap>
              <Button variant="ghost" size="sm">
                Reset
              </Button>
              <Button variant="primary" size="sm">
                Confirm Strategy
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <SelectPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "label",
              type: "string",
              description: "Label above the trigger.",
            },
            {
              name: "options",
              type: "Array<{ value: string; label: string; disabled?: boolean }>",
              description: "List of selectable options.",
            },
            {
              name: "value",
              type: "string",
              description: "Controlled selected value.",
            },
            {
              name: "onChange",
              type: "(value: string) => void",
              description: "Called when selection changes.",
            },
            {
              name: "placeholder",
              type: "string",
              description: "Shown when no value is selected.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Disables the trigger.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Trigger", value: "role=combobox with aria-expanded" },
            { label: "Listbox", value: "role=listbox with aria-selected on options" },
            { label: "Keyboard", value: "Enter/Space to open; Arrow keys to navigate" },
            { label: "Keyboard", value: "Home/End jump to first/last option" },
            { label: "Keyboard", value: "Type-ahead for quick option selection" },
            { label: "Keyboard", value: "Escape to close without selecting" },
            {
              label: "Screen reader",
              value:
                "Announces label + 'pop-up button' + current value; option changes announced as selected; listbox role on dropdown",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SelectPage.displayName = "SelectPage";
