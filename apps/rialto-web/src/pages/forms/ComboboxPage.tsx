import { useMemo, useState } from "react";
import {
  Card,
  Checkbox,
  Combobox,
  type ComboboxOption,
  DataList,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const FRUITS: ComboboxOption[] = [
  { value: "apple", label: "Apple" },
  { value: "apricot", label: "Apricot" },
  { value: "banana", label: "Banana" },
  { value: "blackberry", label: "Blackberry" },
  { value: "cherry", label: "Cherry" },
  { value: "durian", label: "Durian", disabled: true },
  { value: "elderberry", label: "Elderberry" },
  { value: "fig", label: "Fig" },
  { value: "grape", label: "Grape" },
  { value: "kiwi", label: "Kiwi" },
];

const CIRCUITS: ComboboxOption[] = [
  { value: "monza", label: "Monza" },
  { value: "spa", label: "Spa-Francorchamps" },
  { value: "silverstone", label: "Silverstone" },
  { value: "suzuka", label: "Suzuka" },
  { value: "monaco", label: "Monaco" },
];

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function ComboboxPlayground() {
  const [multiple, setMultiple] = useState(true);
  const [value, setValue] = useState("");
  const [values, setValues] = useState<string[]>(["apple", "cherry"]);

  const summary = multiple
    ? values.length > 0
      ? values.join(", ")
      : "none"
    : value || "none";

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <Stack gap="md">
          <Combobox
            label="Fruit"
            hint="Type to filter, then pick with Enter or click"
            options={FRUITS}
            placeholder="Search fruit…"
            multiple={multiple}
            value={value}
            onChange={setValue}
            values={values}
            onValuesChange={setValues}
            emptyText="No fruit matches"
          />
          <Text variant="caption" color="secondary">
            Selected: {summary}
          </Text>
        </Stack>
      </Card>
      <div className={styles.row}>
        <Checkbox label="Multiple selection" checked={multiple} onCheckedChange={setMultiple} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Async demo
// ---------------------------------------------------------------------------

function AsyncCombobox() {
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  // Simulated server-side filtering: when "loading" is on we surface no options
  // so the loading row is visible; otherwise we filter the demo set locally.
  const results = useMemo(
    () =>
      loading
        ? []
        : CIRCUITS.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [loading, query]
  );

  return (
    <Stack gap="md">
      <Combobox
        label="Circuit (async)"
        hint="Toggle loading to preview the announced loading state"
        options={results}
        inputValue={query}
        onInputChange={setQuery}
        filter={false}
        loading={loading}
        loadingText="Fetching circuits…"
        emptyText="No circuits found"
        placeholder="Search circuits…"
      />
      <div className={styles.row}>
        <Checkbox label="Simulate loading" checked={loading} onCheckedChange={setLoading} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ComboboxPage() {
  const [single, setSingle] = useState("");
  const [tags, setTags] = useState<string[]>(["apple"]);

  return (
    <ComponentPageLayout
      name="Combobox"
      description="Editable, filterable listbox built on the shared useCombobox state machine. Supports single selection with type-ahead, multi-select with removable chips, and async loading/empty states announced via a polite live region."
    >
      {/* ── Single Select ─────────────────────────────────────────────── */}
      <Section title="Single Select">
        <Stack gap="md">
          <Combobox
            label="Fruit"
            hint="Type to filter; navigate with arrows, select with Enter"
            options={FRUITS}
            value={single}
            onChange={setSingle}
            placeholder="Search fruit…"
          />
          <Text variant="caption" color="secondary">
            Type-ahead filtering with full keyboard navigation. Disabled options (Durian) are
            skipped.
          </Text>
        </Stack>
      </Section>

      {/* ── Multi Select ──────────────────────────────────────────────── */}
      <Section title="Multi Select (chips)">
        <Stack gap="md">
          <Combobox
            label="Toppings"
            hint="Pick several; each selection becomes a removable chip"
            options={FRUITS}
            multiple
            values={tags}
            onValuesChange={setTags}
            placeholder="Add fruit…"
          />
          <Text variant="caption" color="secondary">
            Selecting toggles membership and keeps the list open. Backspace on an empty input
            removes the last chip.
          </Text>
        </Stack>
      </Section>

      {/* ── Async & States ────────────────────────────────────────────── */}
      <Section title="Async Loading & Empty">
        <AsyncCombobox />
      </Section>

      {/* ── States ────────────────────────────────────────────────────── */}
      <Section title="Field States">
        <Stack gap="md">
          <Combobox label="Required" options={FRUITS} required placeholder="Required…" />
          <Combobox label="Optional" options={FRUITS} showOptional placeholder="Optional…" />
          <Combobox
            label="With error"
            options={FRUITS}
            error
            hint="Please choose a fruit"
            placeholder="Invalid…"
          />
          <Combobox
            label="Disabled"
            options={FRUITS}
            disabled
            multiple
            values={["banana"]}
            placeholder="Disabled…"
          />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Session Setup
            </Text>
            <Text variant="caption" color="secondary">
              Choose the circuits to include in the weekend schedule.
            </Text>
            <Combobox
              label="Circuits"
              options={CIRCUITS}
              multiple
              placeholder="Add circuits…"
            />
          </Stack>
        </Card>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <ComboboxPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Combobox" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=combobox on input; role=listbox on dropdown" },
            {
              label: "ARIA",
              value:
                "aria-expanded, aria-controls, aria-activedescendant, aria-autocomplete=list, aria-multiselectable (multi)",
            },
            {
              label: "Keyboard",
              value:
                "ArrowUp/Down navigate, Home/End jump, Enter selects, Escape closes, Backspace removes last chip",
            },
            {
              label: "Focus",
              value: "Stays on the input throughout; selection restores focus to the input",
            },
            {
              label: "Live region",
              value:
                "Result count, loading, and empty states announced politely via role=status aria-live",
            },
            {
              label: "Motion",
              value: "Dropdown entrance animation respects prefers-reduced-motion",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ComboboxPage.displayName = "ComboboxPage";
