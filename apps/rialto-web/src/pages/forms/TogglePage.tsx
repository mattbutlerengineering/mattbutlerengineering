import { useState } from "react";
import { Button, Card, Checkbox, DataList, Stack, Text, Toggle } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function TogglePlayground() {
  const [checked, setChecked] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [hasReason, setHasReason] = useState(false);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <Toggle
          label="Launch control active"
          checked={checked}
          onCheckedChange={setChecked}
          disabled={disabled}
          disabledReason={hasReason ? "Feature requires enterprise plan" : undefined}
        />
      </Card>
      <div className={styles.row}>
        <Checkbox label="Checked" checked={checked} onCheckedChange={setChecked} />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
        <Checkbox
          label="Show disabled reason"
          checked={hasReason}
          onCheckedChange={setHasReason}
        />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TogglePage() {
  const [toggleA, setToggleA] = useState(false);
  const [toggleB, setToggleB] = useState(true);

  return (
    <ComponentPageLayout
      name="Toggle"
      description="Spring physics on the knob. The click-detent feel comes from high stiffness with controlled damping — like a physical rocker switch snapping into position."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <div className={styles.stack}>
          <Toggle label="Launch control" checked={toggleA} onCheckedChange={setToggleA} />
          <Toggle label="Active aerodynamics" checked={toggleB} onCheckedChange={setToggleB} />
        </div>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <div className={styles.stack}>
          <Toggle label="Default off" />
          <Toggle label="Default on" defaultChecked />
          <Toggle label="Disabled off" disabled />
          <Toggle label="Disabled on" disabled checked />
          <Toggle label="Locked (with reason)" disabled disabledReason="Feature requires enterprise plan" />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Driver Aids
            </Text>
            <Text variant="caption" color="secondary">
              Configure active driving assistance systems.
            </Text>
            <div className={styles.stack}>
              <Toggle label="Traction control" defaultChecked />
              <Toggle label="ABS" defaultChecked />
              <Toggle label="Active suspension" defaultChecked />
              <Toggle label="DRS automatic" disabled disabledReason="Only available during race mode" />
            </div>
            <div className={styles.row} style={{ justifyContent: "flex-end" }}>
              <Button variant="primary" size="sm">
                Save Configuration
              </Button>
            </div>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <TogglePlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "label",
              type: "string",
              description: "Label text beside the toggle.",
            },
            {
              name: "checked",
              type: "boolean",
              description: "Controlled on/off state.",
            },
            {
              name: "defaultChecked",
              type: "boolean",
              default: "false",
              description: "Uncontrolled initial state.",
            },
            {
              name: "onCheckedChange",
              type: "(checked: boolean) => void",
              description: "Called when state changes.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Disables the toggle.",
            },
            {
              name: "disabledReason",
              type: "string",
              description: "Tooltip shown on hover when disabled.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=switch" },
            { label: "State", value: "aria-checked=true/false" },
            { label: "Keyboard", value: "Space toggles on/off" },
            { label: "Focus", value: "Gold glow ring on focus-visible" },
            { label: "Disabled", value: "aria-disabled=true; no interaction" },
            {
              label: "Screen reader",
              value:
                "Announces label + 'switch' + on/off state; state change announced immediately on toggle",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TogglePage.displayName = "TogglePage";
