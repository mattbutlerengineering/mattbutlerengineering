// Evaluates `${{ }}` templates from workflow YAML against a github context, so
// tests can pin what a `concurrency.group` resolves to, not just its text. The
// expression subset used there (&&, ||, ==, !=, format) mostly means the same in
// JS, with two gaps: GitHub `==` on strings is case-insensitive (JS is not), and
// a missing property is null on GitHub but throws a TypeError in JS.
const format = (template, ...args) =>
  template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));

export function evaluateTemplate(template, github) {
  return template.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expr) =>
    String(new Function("github", "format", `return (${expr});`)(github, format))
  );
}
