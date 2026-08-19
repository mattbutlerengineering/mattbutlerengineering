import { RuleTester } from "eslint";
import localRules from "./local-rules.js";

const rule = localRules.rules["require-accessible-field-label"];
if (!rule) throw new Error("require-accessible-field-label rule not found");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const message = (name: string) =>
  `<${name}> must have a "label", "aria-label", or "aria-labelledby" prop for an accessible name.`;

ruleTester.run("require-accessible-field-label", rule, {
  valid: [
    // `label` prop present.
    { code: 'const x = () => <Input label="Email" />;\n' },
    // Visually-hidden pattern: `aria-label` alone is sufficient.
    { code: 'const x = () => <Input aria-label="Search" />;\n' },
    // `aria-labelledby` referencing an external element is also sufficient.
    { code: 'const x = () => <Input aria-labelledby="external-heading" />;\n' },
    { code: 'const x = () => <Select options={options} label="Country" />;\n' },
    { code: 'const x = () => <TextArea aria-label="Bio" />;\n' },
    // Unrelated component names are never inspected.
    { code: "const x = () => <Button>Click</Button>;\n" },
    { code: 'const x = () => <div label="not a field" />;\n' },
    // A spread could carry the label prop dynamically — can't prove a
    // violation statically, so the rule must not false-positive here.
    { code: "const x = () => <Input {...fieldProps} />;\n" },
  ],
  invalid: [
    {
      code: "const x = () => <Input />;\n",
      errors: [{ message: message("Input") }],
    },
    {
      code: 'const x = () => <Input placeholder="Search..." />;\n',
      errors: [{ message: message("Input") }],
    },
    {
      code: "const x = () => <Select options={options} />;\n",
      errors: [{ message: message("Select") }],
    },
    {
      code: "const x = () => <TextArea rows={4} />;\n",
      errors: [{ message: message("TextArea") }],
    },
  ],
});
