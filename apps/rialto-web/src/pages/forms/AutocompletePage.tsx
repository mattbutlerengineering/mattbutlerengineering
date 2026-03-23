import { useState } from "react";
import {
  Autocomplete,
  type AutocompleteOption,
  Button,
  Card,
  Checkbox,
  DataList,
  Stack,
  Text,
} from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const TRACKS: AutocompleteOption[] = [
  { value: "monza", label: "Monza" },
  { value: "spa", label: "Spa-Francorchamps" },
  { value: "silverstone", label: "Silverstone" },
  { value: "suzuka", label: "Suzuka" },
  { value: "monaco", label: "Monaco" },
  { value: "fiorano", label: "Fiorano" },
  { value: "mugello", label: "Mugello" },
  { value: "imola", label: "Imola" },
  { value: "nurburgring", label: "Nürburgring" },
  { value: "interlagos", label: "Interlagos" },
];

const DRIVERS: AutocompleteOption[] = [
  { value: "leclerc", label: "Charles Leclerc" },
  { value: "sainz", label: "Carlos Sainz" },
  { value: "verstappen", label: "Max Verstappen" },
  { value: "hamilton", label: "Lewis Hamilton" },
  { value: "norris", label: "Lando Norris" },
  { value: "russell", label: "George Russell" },
];

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function AutocompletePlayground() {
  const [value, setValue] = useState("");
  const [selected, setSelected] = useState<AutocompleteOption | null>(null);
  const [showOptional, setShowOptional] = useState(false);
  const [required, setRequired] = useState(false);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        <Stack gap="md">
          <Autocomplete
            label="Select a Circuit"
            hint="Start typing to filter circuits"
            options={TRACKS}
            value={value}
            onChange={setValue}
            onSelect={(opt) => setSelected(opt)}
            emptyText="No circuits found"
            placeholder="Search circuits..."
            showOptional={showOptional}
            required={required}
          />
          {selected && (
            <Text variant="caption" color="secondary">
              Selected: {selected.label} ({selected.value})
            </Text>
          )}
        </Stack>
      </Card>
      <div className={styles.row}>
        <Checkbox
          label="Show Optional"
          checked={showOptional}
          onCheckedChange={setShowOptional}
        />
        <Checkbox
          label="Required"
          checked={required}
          onCheckedChange={setRequired}
        />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AutocompletePage() {
  const [selectedTrack, setSelectedTrack] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [emptyValue, setEmptyValue] = useState("");

  return (
    <ComponentPageLayout
      name="Autocomplete"
      description="Combobox with filtered dropdown. Type to narrow options, navigate with arrow keys, select with Enter. Built on a native input with ARIA combobox semantics."
    >
      {/* ── Basic Usage ─────────────────────────────────────────────── */}
      <Section title="Basic Usage">
        <Stack gap="md">
          <Autocomplete
            label="Circuit"
            hint="Select a racing circuit"
            options={TRACKS}
            value={selectedTrack}
            onChange={setSelectedTrack}
            placeholder="Search circuits..."
          />
          <Text variant="caption" color="secondary">
            Uncontrolled filtering — type to narrow the list, use arrow keys to navigate, Enter to
            select.
          </Text>
        </Stack>
      </Section>

      {/* ── Multiple Instances ────────────────────────────────────────── */}
      <Section title="Multiple Fields">
        <div className={styles.row}>
          <Autocomplete
            label="Circuit"
            options={TRACKS}
            placeholder="Search circuits..."
          />
          <Autocomplete
            label="Driver"
            options={DRIVERS}
            placeholder="Search drivers..."
          />
        </div>
      </Section>

      {/* ── States ────────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack gap="md">
          <Autocomplete
            label="With Hint"
            hint="Start typing to filter"
            options={TRACKS}
            placeholder="Search circuits..."
          />
          <Autocomplete
            label="Required Field"
            options={TRACKS}
            placeholder="Required..."
            required
          />
          <Autocomplete
            label="Optional Field"
            options={TRACKS}
            placeholder="Optional..."
            showOptional
          />
          <Autocomplete
            label="Empty Results"
            hint="Try typing something with no match"
            options={TRACKS}
            value={emptyValue}
            onChange={setEmptyValue}
            emptyText="No circuits match your search"
            placeholder="Type 'xyz' to see empty state..."
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
              Configure the circuit and driver for the upcoming session.
            </Text>
            <Autocomplete
              label="Circuit"
              options={TRACKS}
              value={selectedTrack}
              onChange={setSelectedTrack}
              placeholder="Search circuits..."
            />
            <Autocomplete
              label="Driver"
              options={DRIVERS}
              value={selectedDriver}
              onChange={setSelectedDriver}
              placeholder="Search drivers..."
            />
            <div className={styles.row} style={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <Button variant="primary" size="sm">
                Start Session
              </Button>
            </div>
          </Stack>
        </Card>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <AutocompletePlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "options",
              type: "AutocompleteOption[]",
              description: "Array of { value, label } options to display in the dropdown.",
            },
            {
              name: "value",
              type: "string",
              description: "Controlled input value.",
            },
            {
              name: "onChange",
              type: "(value: string) => void",
              description: "Called on every keystroke with the current input string.",
            },
            {
              name: "onSelect",
              type: "(option: AutocompleteOption) => void",
              description: "Called when the user selects an option from the list.",
            },
            {
              name: "label",
              type: "string",
              description: "Label text rendered above the input.",
            },
            {
              name: "hint",
              type: "string",
              description: "Helper text rendered below the input.",
            },
            {
              name: "placeholder",
              type: "string",
              description: "Input placeholder text.",
            },
            {
              name: "emptyText",
              type: "string",
              default: '"No results"',
              description: "Message shown when no options match the current input.",
            },
            {
              name: "required",
              type: "boolean",
              default: "false",
              description: "Marks the field as required with an asterisk.",
            },
            {
              name: "showOptional",
              type: "boolean",
              default: "false",
              description: 'Appends "(optional)" label when the field is not required.',
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=combobox on input; role=listbox on dropdown" },
            {
              label: "ARIA",
              value: "aria-expanded, aria-controls, aria-activedescendant wired automatically",
            },
            {
              label: "Keyboard",
              value: "ArrowDown/Up to navigate, Enter to select, Escape to close",
            },
            { label: "Focus", value: "Stays on input throughout; selection restores focus" },
            {
              label: "Motion",
              value: "Dropdown entrance animation respects prefers-reduced-motion",
            },
            {
              label: "Screen reader",
              value:
                "Announces as combobox; filtered results count via aria-live; arrow navigation announces each option; selected option announced on Enter",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

AutocompletePage.displayName = "AutocompletePage";
