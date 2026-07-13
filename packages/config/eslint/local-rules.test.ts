import { RuleTester } from "eslint";
import localRules from "./local-rules.js";

const rule = localRules.rules["prefer-rialto-components"];

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const RIALTO = "@mattbutlerengineering/rialto";

ruleTester.run("prefer-rialto-components", rule, {
  valid: [
    // No mapped native elements — nothing to report.
    {
      code: "const x = () => <Button>Click</Button>;\n",
    },
    // The Rialto package itself is exempt (circularity guard).
    {
      code: "const x = () => <button>Click</button>;\n",
      filename: "/repo/packages/rialto/src/Button.tsx",
    },
  ],
  invalid: [
    // NO import present: still warns on both tags, but MUST NOT autofix —
    // renaming without the import would produce TS2304 / ReferenceError.
    // `output: null` asserts no autofix is suggested (code left unchanged).
    {
      code: "const x = () => <button>Click</button>;\n",
      errors: 2,
      output: null,
    },
    // span -> Text, no import: warns, no autofix.
    {
      code: "const x = () => <span>hi</span>;\n",
      errors: 2,
      output: null,
    },
    // A DIFFERENT Rialto component is imported, but not the mapped one:
    // Button is not in scope, so no autofix.
    {
      code: `import { Input } from "${RIALTO}";\nconst x = () => <button>Click</button>;\n`,
      errors: 2,
      output: null,
    },
    // Button IS imported: fixer renames BOTH the opening and closing tag.
    {
      code: `import { Button } from "${RIALTO}";\nconst x = () => <button>Click</button>;\n`,
      errors: 2,
      output: `import { Button } from "${RIALTO}";\nconst x = () => <Button>Click</Button>;\n`,
    },
    // Text IS imported (span/p map to Text): both tags renamed consistently.
    {
      code: `import { Text } from "${RIALTO}";\nconst x = () => <span>hi</span>;\n`,
      errors: 2,
      output: `import { Text } from "${RIALTO}";\nconst x = () => <Text>hi</Text>;\n`,
    },
  ],
});
