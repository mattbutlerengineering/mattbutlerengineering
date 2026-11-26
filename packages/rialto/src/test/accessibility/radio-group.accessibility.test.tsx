/**
 * Axe coverage for RadioGroup variants the fixture matrix does not render:
 * default children, error, horizontal and the options-array form.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Radio, RadioGroup } from "../../components/Checkbox/Checkbox";

const noop = () => {};
// jsdom cannot compute contrast; token-contrast.test.ts covers it.
const check = () => axe(document.body, { rules: { "color-contrast": { enabled: false } } });
const options = [
  { value: "a", label: "Alpha", description: "First" },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma", disabled: true },
];

describe("Accessibility — RadioGroup variants", () => {
  it("default (children)", async () => {
    render(
      <main>
        <RadioGroup label="Size" name="s" value="a" onChange={noop}>
          <Radio label="Alpha" value="a" />
          <Radio label="Beta" value="b" />
        </RadioGroup>
      </main>
    );
    expect(await check()).toHaveNoViolations();
  });

  it("error", async () => {
    render(
      <main>
        <RadioGroup
          label="Size"
          name="s"
          value=""
          onChange={noop}
          description="Pick one"
          error="Choose a size"
          required
          options={options}
        />
      </main>
    );
    expect(await check()).toHaveNoViolations();
  });

  it("horizontal", async () => {
    render(
      <main>
        <RadioGroup
          label="Size"
          name="s"
          value="b"
          onChange={noop}
          orientation="horizontal"
          options={options}
        />
      </main>
    );
    expect(await check()).toHaveNoViolations();
  });

  it("options array", async () => {
    render(
      <main>
        <RadioGroup label="Size" name="s" value="a" onChange={noop} options={options} />
      </main>
    );
    expect(await check()).toHaveNoViolations();
  });
});
