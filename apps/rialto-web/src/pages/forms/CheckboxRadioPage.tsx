import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataList,
  Radio,
  RadioGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CheckboxRadioPage() {
  const [checkA, setCheckA] = useState(true);
  const [checkB, setCheckB] = useState(false);
  const [checkC, setCheckC] = useState(false);
  const [radioValue, setRadioValue] = useState("sport");
  const [playgroundChecked, setPlaygroundChecked] = useState(false);
  const [playgroundRadio, setPlaygroundRadio] = useState("a");

  const allChecked = checkA && checkB && checkC;
  const someChecked = (checkA || checkB || checkC) && !allChecked;

  return (
    <ComponentPageLayout
      name="Checkbox & Radio"
      description="Gold check marks and radio dots with spring animation — the same detent-snap physics as Toggle. Indeterminate state for partial selections. Radio groups with fieldset semantics."
    >
      {/* ── Checkbox ──────────────────────────────────────────────── */}
      <Section title="Checkbox">
        <div className={styles.stack}>
          <Checkbox label="Traction control" checked={checkA} onCheckedChange={setCheckA} />
          <Checkbox
            label="ABS intervention"
            checked={checkB}
            onCheckedChange={setCheckB}
            description="Reduces braking pressure to prevent wheel lock-up"
          />
          <Checkbox
            label="Select all systems"
            checked={allChecked}
            indeterminate={someChecked}
            onCheckedChange={(v) => {
              setCheckA(v);
              setCheckB(v);
              setCheckC(v);
            }}
          />
          <Checkbox label="Launch control" checked={checkC} onCheckedChange={setCheckC} />
          <Checkbox label="Disabled option" disabled />
          <Checkbox label="Disabled checked" disabled checked />
        </div>
      </Section>

      {/* ── Indeterminate State ────────────────────────────────────── */}
      <Section title="Indeterminate State">
        <Text variant="caption" color="secondary">
          When some but not all child checkboxes are selected, the parent shows an indeterminate
          state — a dash instead of a check mark. Toggle the individual checkboxes above to see it.
        </Text>
      </Section>

      {/* ── Radio Group ───────────────────────────────────────────── */}
      <Section title="Radio Group">
        <Stack direction="row" gap="sm" align="start" wrap>
          <RadioGroup
            label="Driving Mode"
            name="showcase-driving-mode"
            value={radioValue}
            onChange={setRadioValue}
          >
            <Radio label="Comfort" value="comfort" />
            <Radio
              label="Sport"
              value="sport"
              description="Sharpened throttle and steering response"
            />
            <Radio label="Race" value="race" />
            <Radio label="Wet" value="wet" disabled />
          </RadioGroup>

          <RadioGroup label="Tyre Compound" name="showcase-tyre" value="medium" onChange={() => {}}>
            <Radio label="Soft (C5)" value="soft" />
            <Radio label="Medium (C3)" value="medium" />
            <Radio label="Hard (C1)" value="hard" />
            <Radio label="Intermediate" value="inter" />
            <Radio label="Full Wet" value="wet" />
          </RadioGroup>
        </Stack>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack direction="row" gap="sm" align="start" wrap>
          <Stack gap="sm">
            <Text variant="detail" color="tertiary">
              Checkbox states
            </Text>
            <Checkbox label="Unchecked" checked={false} onCheckedChange={() => {}} />
            <Checkbox label="Checked" checked={true} onCheckedChange={() => {}} />
            <Checkbox
              label="Indeterminate"
              checked={false}
              indeterminate={true}
              onCheckedChange={() => {}}
            />
            <Checkbox label="Disabled" disabled />
            <Checkbox label="Disabled checked" disabled checked />
          </Stack>
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Session Configuration
            </Text>
            <Stack direction="row" gap="sm" align="start" wrap>
              <Stack gap="sm">
                <Text variant="detail" color="tertiary">
                  Active systems
                </Text>
                <Checkbox
                  label="Traction control"
                  checked={playgroundChecked}
                  onCheckedChange={setPlaygroundChecked}
                />
                <Checkbox label="ABS" checked={true} onCheckedChange={() => {}} />
                <Checkbox label="DRS" checked={false} onCheckedChange={() => {}} />
              </Stack>
              <RadioGroup
                label="Brake balance"
                name="brake-balance"
                value={playgroundRadio}
                onChange={setPlaygroundRadio}
              >
                <Radio label="Front bias (56%)" value="a" />
                <Radio label="Neutral (50%)" value="b" />
                <Radio label="Rear bias (44%)" value="c" />
              </RadioGroup>
            </Stack>
            <Stack direction="row" gap="sm" align="center" justify="end" wrap>
              <Button variant="primary" size="sm">
                Apply
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Props Table (Checkbox) ─────────────────────────────────── */}
      <Section title="Checkbox Props">
        <PropsTable component="Checkbox" />
      </Section>

      {/* ── Props Table (RadioGroup) ───────────────────────────────── */}
      <Section title="RadioGroup Props">
        <PropsTable component="RadioGroup" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Checkbox element", value: "Native <input type=checkbox>" },
            { label: "Radio element", value: "Native <input type=radio>" },
            { label: "Group", value: "RadioGroup renders <fieldset> + <legend>" },
            { label: "Keyboard", value: "Space toggles checkbox; Arrow keys navigate radio group" },
            { label: "Indeterminate", value: "aria-checked=mixed for indeterminate checkboxes" },
            { label: "Focus", value: "Gold glow ring on focus-visible" },
            {
              label: "Screen reader",
              value:
                "Checkbox: announces label + 'checkbox' + checked state; Radio: announces label + 'radio button' + position in group ('1 of 3')",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

CheckboxRadioPage.displayName = "CheckboxRadioPage";
