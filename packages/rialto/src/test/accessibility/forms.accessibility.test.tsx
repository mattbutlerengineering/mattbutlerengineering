import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

/* ── Components ─────────────────────────────── */
import { Autocomplete } from "../../components/Autocomplete/Autocomplete";
import { Input } from "../../components/Input/Input";
import { InputGroup } from "../../components/InputGroup/InputGroup";
import { NumberInput } from "../../components/NumberInput/NumberInput";
import { PinInput } from "../../components/PinInput/PinInput";
import { Select } from "../../components/Select/Select";
import { Slider } from "../../components/Slider/Slider";
import { TextArea } from "../../components/TextArea/TextArea";
import { Toggle } from "../../components/Toggle/Toggle";

describe("Accessibility — Form Components", () => {
  it("Autocomplete", async () => {
    const { container } = render(
      <Autocomplete
        label="Country"
        options={[
          { label: "United States", value: "US" },
          { label: "Canada", value: "CA" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Input", async () => {
    const { container } = render(<Input label="Email" placeholder="you@example.com" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("InputGroup", async () => {
    const { container } = render(
      <InputGroup aria-label="Price">
        <span>$</span>
        <Input placeholder="0.00" />
      </InputGroup>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("NumberInput", async () => {
    const { container } = render(
      <NumberInput label="Quantity" value={1} onChange={() => {}} min={1} max={10} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("PinInput", async () => {
    const { container } = render(<PinInput label="Verification Code" length={4} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Select", async () => {
    const { container } = render(
      <Select
        label="Theme"
        options={[
          { label: "Light", value: "light" },
          { label: "Dark", value: "dark" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Slider", async () => {
    const { container } = render(<Slider label="Volume" min={0} max={100} defaultValue={50} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("TextArea", async () => {
    const { container } = render(<TextArea label="Comments" placeholder="Write something..." />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Toggle", async () => {
    const { container } = render(<Toggle label="Notifications" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
