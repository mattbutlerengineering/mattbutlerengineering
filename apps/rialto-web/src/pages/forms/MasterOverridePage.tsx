import { useState } from "react";
import {
  Card,
  Checkbox,
  DataList,
  MasterOverride,
  OverridePanel,
  SegmentedControl,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

function HoldDemo() {
  const [on, setOn] = useState(false);
  return (
    <Stack gap="md">
      <MasterOverride
        label="Launch sequence"
        description="Press and hold the switch for 1 second to engage."
        on={on}
        onChange={setOn}
        requireHold
        variant="danger"
      />
      <Text variant="caption" color="secondary">
        Hold engages; a single click disengages (asymmetric dead-man switch).
      </Text>
    </Stack>
  );
}

function SplitFlapDemo() {
  const [on, setOn] = useState(false);
  return (
    <Stack gap="md">
      <MasterOverride
        label="System state"
        description="Label transitions through mechanical split-flap cells."
        on={on}
        onChange={setOn}
        idleLabel="OFFLINE"
        activeLabel="ONLINE"
        labelTransition="splitflap"
      />
    </Stack>
  );
}

function AutoRecloseDemo() {
  const [on, setOn] = useState(false);
  return (
    <Stack gap="md">
      <MasterOverride
        label="One-way Valve"
        description="Safety cover automatically re-closes after engagement to lock the state."
        on={on}
        onChange={setOn}
        autoReclose
        variant="warning"
      />
    </Stack>
  );
}

function OverridePanelDemo() {
  const [sw1, setSw1] = useState(false);
  const [sw2, setSw2] = useState(false);
  const [sw3, setSw3] = useState(true);

  return (
    <OverridePanel title="Main Launch Console">
      <MasterOverride label="LOX Flow" on={sw1} onChange={setSw1} size="sm" />
      <MasterOverride label="RP-1 Pump" on={sw2} onChange={setSw2} size="sm" />
      <MasterOverride label="Ignition" on={sw3} onChange={setSw3} size="sm" variant="danger" />
    </OverridePanel>
  );
}

function MasterOverridePlayground() {
  const [on, setOn] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [autoReclose, setAutoReclose] = useState(false);
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [variant, setVariant] = useState<"default" | "warning" | "danger">("warning");
  const [feedback, setFeedback] = useState<"none" | "click" | "haptic" | "both">("none");

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <MasterOverride
          label="Reactor Primary"
          description="Lifts the protective cover to expose the master arming switch."
          on={on}
          onChange={setOn}
          size={size}
          variant={variant}
          disabled={disabled}
          autoReclose={autoReclose}
          feedback={feedback}
        />
      </Card>
      <div className={styles.row}>
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
        <Checkbox label="Auto Re-close" checked={autoReclose} onCheckedChange={setAutoReclose} />
      </div>
      <Stack gap="sm">
        <Text variant="caption" color="secondary">Size</Text>
        <SegmentedControl
          value={size}
          onChange={(v) => setSize(v as "sm" | "md" | "lg")}
          segments={[
            { id: "sm", label: "Small" },
            { id: "md", label: "Medium" },
            { id: "lg", label: "Large" },
          ]}
        />
      </Stack>
      <Stack gap="sm">
        <Text variant="caption" color="secondary">Variant</Text>
        <SegmentedControl
          value={variant}
          onChange={(v) => setVariant(v as "default" | "warning" | "danger")}
          segments={[
            { id: "default", label: "Default" },
            { id: "warning", label: "Warning" },
            { id: "danger", label: "Danger" },
          ]}
        />
      </Stack>
      <Stack gap="sm">
        <Text variant="caption" color="secondary">Feedback</Text>
        <SegmentedControl
          value={feedback}
          onChange={(v) => setFeedback(v as "none" | "click" | "haptic" | "both")}
          segments={[
            { id: "none", label: "None" },
            { id: "click", label: "Audio" },
            { id: "haptic", label: "Haptic" },
            { id: "both", label: "Both" },
          ]}
        />
      </Stack>
    </Stack>
  );
}

export function MasterOverridePage() {
  const [primary, setPrimary] = useState(false);
  const [secondary, setSecondary] = useState(false);
  const [tertiary, setTertiary] = useState(false);

  return (
    <ComponentPageLayout
      name="Master Override"
      description="A safety-cover toggle for destructive or irreversible actions. The hinged cover introduces a deliberate two-stage gesture — lift, then flip — that prevents accidental activation and makes the commitment feel physical."
    >
      {/* ── Live examples ─────────────────────────────────────────── */}
      <Section title="Variants">
        <Stack direction="row" gap="xl" wrap>
          <MasterOverride
            label="Arm System"
            description="Prepares the system for engagement."
            on={primary}
            onChange={setPrimary}
            variant="default"
          />
          <MasterOverride
            label="Maintenance Lock"
            description="Hold all automated tasks. Used during diagnostics."
            on={secondary}
            onChange={setSecondary}
            variant="warning"
          />
          <MasterOverride
            label="Emergency Stop"
            description="Immediately halts production workloads. Irreversible without a reset."
            on={tertiary}
            onChange={setTertiary}
            variant="danger"
          />
        </Stack>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack direction="row" gap="xl" align="end" wrap>
          <MasterOverride
            label="Small"
            on={false}
            onChange={() => {}}
            size="sm"
          />
          <MasterOverride
            label="Medium"
            on={false}
            onChange={() => {}}
            size="md"
          />
          <MasterOverride
            label="Large"
            on={false}
            onChange={() => {}}
            size="lg"
          />
        </Stack>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack direction="row" gap="xl" wrap>
          <MasterOverride
            label="Disarmed"
            on={false}
            onChange={() => {}}
          />
          <MasterOverride
            label="Engaged"
            on={true}
            onChange={() => {}}
          />
          <MasterOverride
            label="Disabled"
            on={false}
            onChange={() => {}}
            disabled
          />
        </Stack>
      </Section>

      {/* ── Hold to engage ────────────────────────────────────────── */}
      <Section title="Hold to engage">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <HoldDemo />
        </Card>
      </Section>

      {/* ── Split-flap status label ────────────────────────────────── */}
      <Section title="Split-flap status label">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <SplitFlapDemo />
        </Card>
      </Section>

      {/* ── Auto Re-close ─────────────────────────────────────────── */}
      <Section title="Auto Re-close">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <AutoRecloseDemo />
        </Card>
      </Section>

      {/* ── Override Panel ────────────────────────────────────────── */}
      <Section title="Override Panel Composition">
        <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
          <OverridePanelDemo />
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <MasterOverridePlayground />
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            { name: "label", type: "string", description: "Accessible name for the switch. Also rendered above the bezel." },
            { name: "on", type: "boolean", description: "Controlled switch position — true is engaged." },
            { name: "onChange", type: "(on: boolean) => void", description: "Fires when the switch is flipped (only when the cover is open)." },
            { name: "description", type: "ReactNode", description: "Supporting context rendered beneath the bezel." },
            { name: "idleLabel", type: "string", default: '"STANDBY"', description: "Text rendered on the switch face when off." },
            { name: "activeLabel", type: "string", default: '"ENGAGED"', description: "Text rendered on the switch face when on." },
            { name: "coverLabel", type: "string", default: '"LIFT TO ARM"', description: "Text on the safety cover." },
            { name: "size", type: '"sm" | "md" | "lg"', default: '"md"', description: "Overall component scale." },
            { name: "variant", type: '"default" | "warning" | "danger"', default: '"warning"', description: "Colors the stripe on the safety cover." },
            { name: "disabled", type: "boolean", default: "false", description: "Prevents all interaction." },
            { name: "requireHold", type: "boolean | number", default: "false", description: "Requires pressing and holding the switch to engage. Number specifies delay in ms." },
            { name: "labelTransition", type: '"fade" | "splitflap"', default: '"fade"', description: "The animation used to swap status labels." },
            { name: "feedback", type: '"none" | "click" | "haptic" | "both"', default: '"none"', description: "Optional audio/haptic feedback on engagement." },
            { name: "autoReclose", type: "boolean", default: "false", description: "Automatically closes the cover after engagement." },
            { name: "autoRecloseMs", type: "number", default: "800", description: "Delay before auto-closing." },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Cover role", value: 'button with aria-expanded / aria-controls' },
            { label: "Switch role", value: "role=switch, aria-checked" },
            { label: "Keyboard", value: "Enter/Space on cover toggles cover; Space on switch toggles state" },
            { label: "Focus transfer", value: "Cover→switch on lift; switch→cover on close — via user action only" },
            { label: "Disabled switch", value: "Native disabled while cover is closed — unreachable by Tab and inert to clicks" },
            { label: "Live region", value: "Polite aria-live announces cover + switch state in one combined message" },
            { label: "Reduced motion", value: "Cover flip and lever glide collapse to instant transitions" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

MasterOverridePage.displayName = "MasterOverridePage";
