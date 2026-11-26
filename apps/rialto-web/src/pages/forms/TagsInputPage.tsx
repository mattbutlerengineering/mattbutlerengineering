import { useState } from "react";
import { Card, Checkbox, DataList, Stack, TagsInput } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function TagsInputPlayground() {
  const [tags, setTags] = useState<string[]>(["vegan"]);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [limited, setLimited] = useState(false);
  const [error, setError] = useState(false);
  const [disabled, setDisabled] = useState(false);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <TagsInput
          label="Dietary notes"
          placeholder="Type and press Enter"
          value={tags}
          onValueChange={setTags}
          allowDuplicates={allowDuplicates}
          maxTags={limited ? 3 : undefined}
          error={error}
          hint={error ? "Check the dietary notes" : "Press Enter or comma to add"}
          disabled={disabled}
        />
      </Card>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Checkbox
          label="Allow duplicates"
          checked={allowDuplicates}
          onCheckedChange={setAllowDuplicates}
        />
        <Checkbox label="Max 3 tags" checked={limited} onCheckedChange={setLimited} />
        <Checkbox label="Error" checked={error} onCheckedChange={setError} />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TagsInputPage() {
  return (
    <ComponentPageLayout
      name="Tags Input"
      description="Free-text tags entry. Type a value and press Enter or comma to commit it as a removable chip. For picking from a fixed list, use Combobox instead."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <TagsInputPlayground />
      </Section>

      {/* ── Limits ────────────────────────────────────────────────── */}
      <Section title="Limits">
        <Stack gap="sm">
          <TagsInput label="Up to 3 tags" maxTags={3} defaultValue={["a", "b"]} />
          <TagsInput label="Duplicates allowed" allowDuplicates defaultValue={["Window seat"]} />
        </Stack>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="TagsInput" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Elements", value: "Labelled text input plus a list of chips" },
            { label: "Add", value: "Enter or comma commits; pasting a comma list adds each tag" },
            { label: "Remove", value: "Backspace in an empty input, or each chip's remove button" },
            { label: "Focus", value: "Removing a chip returns focus to the input" },
            {
              label: "Screen reader",
              value: "Additions, removals and rejections are announced politely",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TagsInputPage.displayName = "TagsInputPage";
