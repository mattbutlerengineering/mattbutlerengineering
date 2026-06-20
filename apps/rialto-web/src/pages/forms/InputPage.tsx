import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataList,
  Input,
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

type InputType = "text" | "email" | "password" | "number";

function InputPlayground() {
  const [label, setLabel] = useState("Driver Name");
  const [hint, setHint] = useState("");
  const [error, setError] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [type, setType] = useState<InputType>("text");

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <Input
          label={label}
          placeholder="Enter value..."
          hint={hint || undefined}
          error={error}
          disabled={disabled}
          type={type}
        />
      </Card>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Type"
          value={type}
          onChange={(v) => setType(v as InputType)}
          options={[
            { value: "text", label: "text" },
            { value: "email", label: "email" },
            { value: "password", label: "password" },
            { value: "number", label: "number" },
          ]}
        />
        <Checkbox label="Error state" checked={error} onCheckedChange={setError} />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Input
          label="Label text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          hint="Controls the label shown above"
        />
        <Input
          label="Hint text"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          hint="Optional helper text below the field"
        />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function InputPage() {
  return (
    <ComponentPageLayout
      name="Input"
      description="Machined recessed channels. The inner shadow suggests a physical groove carved into the aluminum surface. Focus brings the gold glow."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <Stack direction="row" gap="sm" align="end" wrap>
          <Input label="Default" placeholder="e.g. Charles Leclerc" />
          <Input label="With hint" placeholder="F80-001" hint="Alphanumeric, 6+ characters" />
        </Stack>
      </Section>

      {/* ── Types ─────────────────────────────────────────────────── */}
      <Section title="Input Types">
        <Stack direction="row" gap="sm" align="end" wrap>
          <Input label="Text" placeholder="Driver name" type="text" />
          <Input label="Email" placeholder="driver@team.com" type="email" />
          <Input label="Password" placeholder="••••••••" type="password" />
          <Input label="Number" placeholder="42" type="number" />
        </Stack>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack direction="row" gap="sm" align="end" wrap>
          <Input label="Default" placeholder="Enabled" />
          <Input label="Error" placeholder="Required" error hint="This field is required" />
          <Input label="Disabled" placeholder="Not editable" disabled />
          <Input label="Read-only" value="SF-24" disabled />
          <Input
            label="Locked"
            placeholder="Requires upgrade"
            disabled
            disabledReason="Upgrade to Pro to edit this field"
          />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Driver Profile
            </Text>
            <Stack direction="row" gap="sm" align="end" wrap>
              <Input label="First Name" placeholder="Charles" />
              <Input label="Last Name" placeholder="Leclerc" />
            </Stack>
            <Input label="Team" placeholder="Scuderia Ferrari" />
            <Input label="Email" placeholder="charles@ferrari.com" type="email" />
            <Stack direction="row" gap="sm" align="center" justify="end" wrap>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <Button variant="primary" size="sm">
                Save Profile
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <InputPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Input" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <input> with associated <label>" },
            { label: "Association", value: "label[for] linked to input[id]" },
            { label: "Error", value: "aria-invalid=true when error prop is set" },
            { label: "Hint", value: "aria-describedby links to hint/error text" },
            { label: "Focus", value: "Gold glow focus ring via box-shadow" },
            { label: "Keyboard", value: "Tab to focus, standard text editing" },
            {
              label: "Screen reader",
              value:
                "Announces label, current value, and 'text field'; error message announced via aria-describedby when present; required state announced",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

InputPage.displayName = "InputPage";
