import { useState } from "react";
import { Button, Card, Checkbox, DataList, Select, Stack, Text, TextArea } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function TextAreaPlayground() {
  const [rows, setRows] = useState("3");
  const [autoResize, setAutoResize] = useState(false);
  const [maxLength, setMaxLength] = useState(false);
  const [error, setError] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [value, setValue] = useState("");

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <TextArea
          label="Session Notes"
          placeholder="Describe track conditions, car behavior, setup changes..."
          rows={Number(rows)}
          autoResize={autoResize}
          maxLength={maxLength ? 140 : undefined}
          error={error}
          hint={error ? "Session notes are required" : maxLength ? "Keep it concise" : undefined}
          disabled={disabled}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Card>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Rows"
          value={rows}
          onChange={setRows}
          options={[
            { value: "2", label: "2 rows" },
            { value: "3", label: "3 rows" },
            { value: "5", label: "5 rows" },
            { value: "8", label: "8 rows" },
          ]}
        />
        <Checkbox label="Auto resize" checked={autoResize} onCheckedChange={setAutoResize} />
        <Checkbox label="Max length (140)" checked={maxLength} onCheckedChange={setMaxLength} />
        <Checkbox label="Error state" checked={error} onCheckedChange={setError} />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TextAreaPage() {
  const [notes, setNotes] = useState("");

  return (
    <ComponentPageLayout
      name="TextArea"
      description="The multi-line sibling of Input. Same recessed channel and gold focus ring. Auto-resize grows with content. Character counter in monospace with over-limit warning."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <Stack direction="row" gap="sm" align="start" wrap>
          <TextArea
            label="Default"
            placeholder="Describe track conditions, car behavior, setup changes..."
            rows={3}
          />
          <TextArea
            label="With character limit"
            placeholder="Notes with character limit..."
            hint="Keep it concise for the pit wall display"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={140}
          />
        </Stack>
      </Section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <Section title="Features">
        <Stack gap="md">
          <div>
            <Text variant="detail" color="tertiary" style={{ marginBottom: "var(--rialto-space-xs)" }}>
              Auto-resize — grows as you type
            </Text>
            <TextArea
              label="Auto-resize"
              placeholder="This field grows as you type..."
              autoResize
              rows={2}
            />
          </div>
        </Stack>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack direction="row" gap="sm" align="start" wrap>
          <TextArea label="Default" placeholder="Enabled" rows={3} />
          <TextArea
            label="Error"
            placeholder="Required field"
            error
            hint="Session notes are required before sign-off"
            rows={3}
          />
          <TextArea label="Disabled" placeholder="Locked after submission" disabled rows={3} />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Post-Race Debrief
            </Text>
            <TextArea
              label="Driver Feedback"
              placeholder="Describe handling characteristics, tire behavior, and suggested setup changes for the next session..."
              rows={4}
              autoResize
              maxLength={500}
            />
            <TextArea
              label="Engineer Notes"
              placeholder="Technical observations and data anomalies..."
              rows={3}
            />
            <Stack direction="row" gap="sm" align="center" justify="end" wrap>
              <Button variant="ghost" size="sm">
                Discard
              </Button>
              <Button variant="primary" size="sm">
                Submit Debrief
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <TextAreaPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "label",
              type: "string",
              description: "Visible label text above the field.",
            },
            {
              name: "placeholder",
              type: "string",
              description: "Placeholder shown when empty.",
            },
            {
              name: "rows",
              type: "number",
              default: "3",
              description: "Initial number of visible rows.",
            },
            {
              name: "autoResize",
              type: "boolean",
              default: "false",
              description: "Automatically grows with content.",
            },
            {
              name: "maxLength",
              type: "number",
              description: "Character limit — shows monospace counter.",
            },
            {
              name: "hint",
              type: "string",
              description: "Helper text shown below the field.",
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
              description: "Disables the textarea.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <textarea> with associated <label>" },
            { label: "Association", value: "label[for] linked to textarea[id]" },
            { label: "Error", value: "aria-invalid=true when error prop is set" },
            { label: "Hint", value: "aria-describedby links to helper text" },
            { label: "Keyboard", value: "Tab to focus, standard text editing" },
            { label: "Resize", value: "Auto-resize respects prefers-reduced-motion" },
            {
              label: "Screen reader",
              value:
                "Announces label, current value, and 'text field'; character count not automatically announced — use aria-live region if needed",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TextAreaPage.displayName = "TextAreaPage";
