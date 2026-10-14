import { RuleTester } from "eslint";
import localRules from "./local-rules.js";

const rule = localRules.rules["no-literal-ui-strings"];
if (!rule) throw new Error("no-literal-ui-strings rule not found");

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

const textError = { messageId: "jsxText" } as const;
const attrError = (name: string) => ({ messageId: "attribute", data: { name } }) as const;

ruleTester.run("no-literal-ui-strings", rule, {
  valid: [
    // Translated text and attributes.
    { code: 'const x = () => <button>{t("actions.save")}</button>;\n' },
    { code: 'const x = () => <Input aria-label={t("search.label")} />;\n' },
    // Punctuation, numbers and whitespace carry no language.
    { code: "const x = () => <span>{a} · {b} — 3:00</span>;\n" },
    { code: "const x = () => <span>\n  {name}\n</span>;\n" },
    // Non-UI attributes may hold literals.
    { code: 'const x = () => <div className="row" data-testid="row" id="main" />;\n' },
    { code: 'const x = () => <Button variant="primary" size="sm" type="submit" />;\n' },
    // Identifiers and non-string expressions are out of scope.
    { code: "const x = () => <Input label={field.label} placeholder={hint} />;\n" },
    { code: "const x = () => <span>{count}</span>;\n" },
    // A template literal with no letters (pure interpolation) is fine.
    { code: "const x = () => <span title={`${a}/${b}`} />;\n" },
  ],
  invalid: [
    { code: "const x = () => <button>Save</button>;\n", errors: [textError] },
    { code: "const x = () => <p>\n  Nothing here yet.\n</p>;\n", errors: [textError] },
    { code: 'const x = () => <span>{"Save"}</span>;\n', errors: [textError] },
    { code: "const x = () => <span>{`Hello ${name}`}</span>;\n", errors: [textError] },
    { code: 'const x = () => <Input aria-label="Search" />;\n', errors: [attrError("aria-label")] },
    { code: 'const x = () => <img alt="Logo" />;\n', errors: [attrError("alt")] },
    { code: 'const x = () => <div title="Details" />;\n', errors: [attrError("title")] },
    {
      code: 'const x = () => <Input placeholder={"Search…"} />;\n',
      errors: [attrError("placeholder")],
    },
    {
      code: "const x = () => <Tag aria-label={`Remove ${label}`} />;\n",
      errors: [attrError("aria-label")],
    },
    {
      code: 'const x = () => <Select label="Country" emptyText="No results" loadingText="Loading" />;\n',
      errors: [attrError("label"), attrError("emptyText"), attrError("loadingText")],
    },
    {
      code: 'const x = () => <Alert heading="Saved" description="All done" message="Ok" />;\n',
      errors: [attrError("heading"), attrError("description"), attrError("message")],
    },
    {
      code: 'const x = () => <Dialog aria-description="More" />;\n',
      errors: [attrError("aria-description")],
    },
  ],
});
