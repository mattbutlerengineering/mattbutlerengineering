import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataList,
  PinInput,
  Select,
  Stack,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type PinInputSize = "sm" | "md" | "lg";
type PinInputType = "numeric" | "alphanumeric";

function PinInputPlayground() {
  const [value, setValue] = useState("");
  const [length, setLength] = useState("4");
  const [type, setType] = useState<PinInputType>("numeric");
  const [size, setSize] = useState<PinInputSize>("md");
  const [mask, setMask] = useState(false);
  const [error, setError] = useState(false);
  const [disabled, setDisabled] = useState(false);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <PinInput
          label="Enter PIN"
          value={value}
          onChange={setValue}
          length={Number(length)}
          type={type}
          size={size}
          mask={mask}
          error={error}
          hint={error ? "Invalid code" : `${length}-digit ${type}`}
          disabled={disabled}
        />
      </Card>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Length"
          value={length}
          onChange={setLength}
          options={[
            { value: "4", label: "4 digits" },
            { value: "6", label: "6 digits" },
            { value: "8", label: "8 digits" },
          ]}
        />
        <Select
          label="Type"
          value={type}
          onChange={(v) => setType(v as PinInputType)}
          options={[
            { value: "numeric", label: "Numeric" },
            { value: "alphanumeric", label: "Alphanumeric" },
          ]}
        />
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as PinInputSize)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
        <Checkbox label="Masked" checked={mask} onCheckedChange={setMask} />
        <Checkbox label="Error" checked={error} onCheckedChange={setError} />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PinInputPage() {
  const [pin, setPin] = useState("");
  const { toast } = useToast();

  return (
    <ComponentPageLayout
      name="Pin Input"
      description="Fixed-length code entry for 2FA and verification codes. Recessed cells with auto-advance, paste support, and spring entry animation."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <PinInput
          label="Verification Code"
          hint="Try entering 1234"
          value={pin}
          onChange={setPin}
          onComplete={(v) => {
            if (v === "1234") {
              toast({ title: "Code verified!", variant: "success" });
              setPin("");
            } else {
              toast({ title: "Invalid code — try 1234", variant: "error" });
              setPin("");
            }
          }}
        />
      </Section>

      {/* ── Length ────────────────────────────────────────────────── */}
      <Section title="Length">
        <Stack direction="row" gap="sm" align="end" wrap>
          <PinInput label="4-digit (default)" />
          <PinInput label="6-digit" length={6} />
        </Stack>
      </Section>

      {/* ── Type ──────────────────────────────────────────────────── */}
      <Section title="Type">
        <Stack direction="row" gap="sm" align="end" wrap>
          <PinInput label="Numeric" hint="Digits only" />
          <PinInput label="Alphanumeric" type="alphanumeric" hint="Letters or digits" />
          <PinInput label="Masked" mask hint="Hidden input" />
        </Stack>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack direction="row" gap="sm" align="end" wrap>
          <PinInput label="Small" size="sm" />
          <PinInput label="Medium" size="md" />
          <PinInput label="Large" size="lg" />
        </Stack>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack direction="row" gap="sm" align="end" wrap>
          <PinInput label="Default" />
          <PinInput label="With value" value="42" />
          <PinInput label="Error" error hint="Invalid code" />
          <PinInput label="Disabled" disabled value="0924" />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Two-Factor Authentication
            </Text>
            <Text variant="caption" color="secondary">
              Enter the 6-digit code from your authenticator app.
            </Text>
            <PinInput
              label="Authentication Code"
              length={6}
              hint="Code refreshes every 30 seconds"
            />
            <Stack direction="row" gap="sm" align="center" justify="end" wrap>
              <Button variant="ghost" size="sm">
                Use backup code
              </Button>
              <Button variant="primary" size="sm">
                Verify
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <PinInputPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "label",
              type: "string",
              description: "Label above the input cells.",
            },
            {
              name: "length",
              type: "number",
              default: "4",
              description: "Number of input cells.",
            },
            {
              name: "value",
              type: "string",
              description: "Controlled value string.",
            },
            {
              name: "onChange",
              type: "(value: string) => void",
              description: "Called as each cell is filled.",
            },
            {
              name: "onComplete",
              type: "(value: string) => void",
              description: "Called when all cells are filled.",
            },
            {
              name: "type",
              type: '"numeric" | "alphanumeric"',
              default: '"numeric"',
              description: "Allowed character types.",
            },
            {
              name: "size",
              type: '"sm" | "md" | "lg"',
              default: '"md"',
              description: "Size of the input cells.",
            },
            {
              name: "mask",
              type: "boolean",
              default: "false",
              description: "Hides input like a password.",
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
              description: "Disables all cells.",
            },
            {
              name: "hint",
              type: "string",
              description: "Helper text below the cells.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Elements", value: "Individual <input> elements per cell" },
            { label: "Auto-advance", value: "Focus moves to next cell on input" },
            { label: "Paste", value: "Full code paste distributes across cells" },
            { label: "Backspace", value: "Clears current cell and moves focus back" },
            { label: "Focus", value: "Gold glow ring on focused cell" },
            {
              label: "Screen reader",
              value:
                "Each field announced as 'text field' with position; auto-advance to next field announced as focus moves; Backspace returns to previous field",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

PinInputPage.displayName = "PinInputPage";
