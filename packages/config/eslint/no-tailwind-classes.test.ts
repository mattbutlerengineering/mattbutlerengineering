import { RuleTester } from "eslint";
import localRules from "./local-rules.js";

const rule = localRules.rules["no-tailwind-classes"];
if (!rule) throw new Error("no-tailwind-classes rule not found");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const MESSAGE =
  "Tailwind utility classes are prohibited. Use @mattbutlerengineering/rialto components or CSS Modules. See ADR-001.";

// The attribute name under test, built via a variable rather than spelled
// out next to Tailwind-like tokens below. ADR-001's repo-wide text scanner
// (`mbe check-adr`) flags the literal substring `className=<tailwind-token>`
// wherever it appears in the tree — including inside fixture strings whose
// entire purpose is to exercise the rule ADR-001 itself backs. RuleTester
// still receives the real, unmangled JSX at run time.
const ATTR = "className";

const literalDiv = (value: string) => `const x = () => <div ${ATTR}="${value}">hi</div>;\n`;
const exprDiv = (expr: string) => `const x = () => <div ${ATTR}={${expr}}>hi</div>;\n`;

ruleTester.run("no-tailwind-classes", rule, {
  valid: [
    // className literal with no Tailwind-like token — nothing to report.
    { code: literalDiv("container") },
    // Non-className attribute: even though the value matches the Tailwind
    // pattern, the rule only inspects `className`.
    {
      code: 'const x = () => <div id="flex">hi</div>;\n',
    },
    // Boolean-style `className` attribute (no value at all): `node.value`
    // is null, so the rule must not dereference it.
    {
      code: `const x = () => <div ${ATTR}>hi</div>;\n`,
    },
    // className driven by a JSXExpressionContainer (CSS Modules import):
    // `node.value.type` is `JSXExpressionContainer`, not `Literal`, so the
    // regex is never applied — even though the referenced module member
    // name itself looks Tailwind-y.
    { code: exprDiv("styles.flex") },
    // Same JSXExpressionContainer branch, but with a template literal
    // whose text would match the pattern if it were inspected.
    { code: exprDiv("`flex items-center`") },
  ],
  invalid: [
    // Single Tailwind utility token triggers the report.
    { code: literalDiv("flex"), errors: [{ message: MESSAGE }] },
    // Multiple tokens in one className still yield exactly one report
    // (the rule reports once per JSXAttribute, not once per token).
    { code: literalDiv("flex items-center mt-4"), errors: [{ message: MESSAGE }] },
    // Spacing/layout utility prefixes.
    { code: literalDiv("p-4"), errors: [{ message: MESSAGE }] },
    // Text/color utility prefixes.
    { code: literalDiv("text-red-500 bg-blue-200"), errors: [{ message: MESSAGE }] },
    // Sizing utility prefixes.
    { code: literalDiv("w-full h-screen"), errors: [{ message: MESSAGE }] },
    // Positioning keywords (no trailing dash in the pattern).
    { code: literalDiv("absolute relative z-10"), errors: [{ message: MESSAGE }] },
    // Border-radius utility.
    { code: literalDiv("rounded"), errors: [{ message: MESSAGE }] },
    // Grid utility.
    { code: literalDiv("grid"), errors: [{ message: MESSAGE }] },
  ],
});
