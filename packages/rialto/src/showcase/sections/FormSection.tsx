import { useState } from "react";
import { Input } from "../../components/Input/Input";
import { TextArea } from "../../components/TextArea/TextArea";
import { Toggle } from "../../components/Toggle/Toggle";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Select } from "../../components/Select/Select";
import { NumberInput } from "../../components/NumberInput/NumberInput";
import { Slider } from "../../components/Slider/Slider";
import { PinInput } from "../../components/PinInput/PinInput";
import { Autocomplete } from "../../components/Autocomplete/Autocomplete";
import { Search, Mail, Lock } from "lucide-react";
import css from "../showcase.module.css";

const SAMPLE_OPTIONS = [
  { label: "United States", value: "us" },
  { label: "United Kingdom", value: "uk" },
  { label: "Canada", value: "ca" },
  { label: "Australia", value: "au" },
  { label: "Germany", value: "de" },
];

function Inputs() {
  return (
    <div className={css.gridWide}>
      <div className={css.inputColumn}>
        <Input label="Email" placeholder="you@example.com" startIcon={<Mail size={16} />} />
        <Input label="Password" type="password" placeholder="Enter password" startIcon={<Lock size={16} />} />
        <Input label="Search" placeholder="Search..." startIcon={<Search size={16} />} />
        <Input label="With hint" hint="This is helper text" placeholder="Enter value" />
        <Input label="Error state" error hint="This field is required" placeholder="Required" />
        <Input label="Disabled" disabled placeholder="Cannot edit" />
        <Input label="Disabled with reason" disabled disabledReason="Contact admin to edit" placeholder="Locked" />
        <Input label="Optional" showOptional placeholder="Not required" />
      </div>
      <div className={css.inputColumn}>
        <TextArea label="Message" placeholder="Write your message..." rows={4} />
        <TextArea label="With hint" hint="Max 500 characters" placeholder="Description..." />
        <TextArea label="Error" error hint="Message too short" placeholder="At least 10 chars..." />
        <TextArea label="Disabled" disabled placeholder="Cannot edit" />
      </div>
    </div>
  );
}

function Toggles() {
  const [checked, setChecked] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-md)" }}>
      <div className={css.row} style={{ gap: "var(--rialto-space-xl)" }}>
        <Toggle label="Dark mode" checked={checked} onCheckedChange={setChecked} />
        <Toggle label="Notifications" />
        <Toggle label="Disabled" disabled />
        <Toggle label="Disabled (on)" checked disabled />
      </div>
      <div className={css.row} style={{ gap: "var(--rialto-space-xl)" }}>
        <Checkbox label="Accept terms" />
        <Checkbox label="Remember me" defaultChecked />
        <Checkbox label="Disabled" disabled />
        <Checkbox label="Disabled checked" disabled defaultChecked />
      </div>
    </div>
  );
}

function Selects() {
  return (
    <div className={css.gridWide}>
      <div className={css.inputColumn}>
        <Select label="Country" placeholder="Choose a country" options={SAMPLE_OPTIONS} />
        <Select label="Disabled" placeholder="Cannot change" options={SAMPLE_OPTIONS} disabled />
        <Select label="With error" placeholder="Required" options={SAMPLE_OPTIONS} error hint="Please select a country" />
      </div>
      <div className={css.inputColumn}>
        <Autocomplete
          label="Search countries"
          placeholder="Type to search..."
          options={SAMPLE_OPTIONS}
        />
      </div>
    </div>
  );
}

function Sliders() {
  const [sliderValue, setSliderValue] = useState(50);
  const [numValue, setNumValue] = useState(42);

  return (
    <div className={css.gridWide}>
      <div className={css.inputColumn}>
        <Slider label="Volume" value={sliderValue} onChange={setSliderValue} min={0} max={100} />
        <Slider label="Disabled" value={30} onChange={() => {}} min={0} max={100} disabled />
      </div>
      <div className={css.inputColumn}>
        <NumberInput label="Quantity" value={numValue} onChange={setNumValue} min={0} max={100} />
        <NumberInput label="Disabled" value={10} onChange={() => {}} disabled />
        <PinInput label="Verification code" />
      </div>
    </div>
  );
}

export function FormSection({ which }: { which: "inputs" | "toggles" | "selects" | "sliders" }) {
  switch (which) {
    case "inputs": return <Inputs />;
    case "toggles": return <Toggles />;
    case "selects": return <Selects />;
    case "sliders": return <Sliders />;
  }
}
