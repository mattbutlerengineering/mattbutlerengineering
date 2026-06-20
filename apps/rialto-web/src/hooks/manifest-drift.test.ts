/**
 * Drift guard: verifies that the forms-category components documented in the
 * showcase have corresponding entries in the compiled rialto manifest.
 *
 * When a component is added to the forms category but the manifest is not
 * regenerated, this test fails — preventing silent documentation drift.
 */
import { describe, it, expect } from "vitest";
import manifest from "@mattbutlerengineering/rialto/manifest";

/**
 * The component names documented in the forms showcase category.
 * Update this list only when adding or removing a forms page.
 */
const FORMS_COMPONENTS = [
  "Button",
  "Input",
  "TextArea",
  "NumberInput",
  "Checkbox",
  "RadioGroup",
  "Toggle",
  "Slider",
  "Select",
  "PinInput",
  "SegmentedControl",
  "Autocomplete",
  "InputGroup",
  "MasterOverride",
] as const;

describe("manifest drift guard — forms category", () => {
  const manifestNames = new Set(manifest.components.map((c) => c.name));

  it.each(FORMS_COMPONENTS)("manifest contains props for forms component: %s", (componentName) => {
    expect(
      manifestNames.has(componentName),
      `Component "${componentName}" is documented in the forms showcase but missing from the rialto manifest. ` +
        `Run "pnpm build --filter @mattbutlerengineering/rialto" to regenerate the manifest.`
    ).toBe(true);
  });
});
