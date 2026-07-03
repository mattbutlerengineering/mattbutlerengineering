import {
  Button,
  Checkbox,
  Input,
  NumberInput,
  Select,
  SegmentedControl,
  Slider,
  TextArea,
  Toggle,
} from "@mattbutlerengineering/rialto";
import { Section } from "./Section";
import { selectOptions } from "./fixtures";
import styles from "./VisualTest.module.css";

/**
 * Form control sections of the Visual Test Harness: Button, Input, TextArea,
 * NumberInput, Select, Toggle, Checkbox, SegmentedControl, Slider.
 */
export function FormSections() {
  return (
    <>
      {/* ── Button ─────────────────────────── */}
      <Section id="button-variants" title="Button — Variants">
        <div className={styles.card}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section id="button-sizes" title="Button — Sizes">
        <div className={styles.card}>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="md">
            Medium
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
        </div>
      </Section>

      {/* ── Input ──────────────────────────── */}
      <Section id="input-states" title="Input — States">
        <div className={styles.cardColumn}>
          <Input label="Default" placeholder="Placeholder text" />
          <Input label="With value" defaultValue="Hello world" />
          <Input label="With hint" hint="This is a hint" />
          <Input label="Error" error />
          <Input label="Disabled" disabled defaultValue="Disabled" />
        </div>
      </Section>

      {/* ── TextArea ─────────────────────────── */}
      <Section id="textarea-states" title="TextArea — States">
        <div className={styles.cardColumn}>
          <TextArea label="Default" placeholder="Enter description..." />
          <TextArea label="With value" defaultValue="Some text content here." />
          <TextArea label="With hint" hint="Maximum 500 characters" />
          <TextArea label="Error" error />
          <TextArea label="Disabled" disabled defaultValue="Disabled" />
        </div>
      </Section>

      {/* ── NumberInput ──────────────────────── */}
      <Section id="numberinput-states" title="NumberInput — States">
        <div className={styles.cardColumn}>
          <NumberInput label="Quantity" value={5} onChange={() => {}} min={0} max={99} />
          <NumberInput label="Disabled" value={10} onChange={() => {}} disabled />
        </div>
      </Section>

      {/* ── Select ─────────────────────────── */}
      <Section id="select-states" title="Select — States">
        <div className={styles.cardColumn}>
          <Select label="Default" placeholder="Choose a fruit" options={selectOptions} />
          <Select label="Disabled" options={selectOptions} disabled />
        </div>
      </Section>

      {/* ── Toggle ─────────────────────────── */}
      <Section id="toggle-states" title="Toggle — States">
        <div className={styles.card}>
          <Toggle label="Off" />
          <Toggle label="On" defaultChecked />
          <Toggle label="Disabled" disabled />
          <Toggle label="Disabled on" disabled defaultChecked />
        </div>
      </Section>

      {/* ── Checkbox ───────────────────────── */}
      <Section id="checkbox-states" title="Checkbox — States">
        <div className={styles.card}>
          <Checkbox label="Unchecked" />
          <Checkbox label="Checked" checked />
          <Checkbox label="Indeterminate" indeterminate />
          <Checkbox label="Disabled" disabled />
        </div>
      </Section>

      {/* ── SegmentedControl ─────────────────── */}
      <Section id="segmentedcontrol-default" title="SegmentedControl">
        <div className={styles.card}>
          <SegmentedControl
            segments={[
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
              { id: "month", label: "Month" },
            ]}
            value="week"
            onChange={() => {}}
          />
        </div>
      </Section>

      {/* ── Slider ─────────────────────────── */}
      <Section id="slider-states" title="Slider — States">
        <div className={styles.cardColumn}>
          <Slider min={0} max={100} defaultValue={40} />
          <Slider min={0} max={100} defaultValue={60} disabled />
        </div>
      </Section>
    </>
  );
}
