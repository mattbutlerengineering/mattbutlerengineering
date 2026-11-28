// Evaluates `${{ }}` templates from workflow YAML against a github context, so
// tests can pin what a `concurrency.group` resolves to, not just its text. The
// expression subset used there (&&, ||, ==, !=, format) means the same in JS.
const format = (template, ...args) =>
  template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));

// GitHub expressions are null-safe on property access (`github.event.x` on a
// push is just null), so dotted access outside string literals becomes `?.`.
const nullSafe = (expr) =>
  expr
    .split(/('[^']*')/)
    .map((part, i) => (i % 2 ? part : part.replace(/\.(?=[A-Za-z_])/g, "?.")))
    .join("");

export function evaluateTemplate(template, github) {
  return template.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expr) =>
    String(new Function("github", "format", `return (${nullSafe(expr)});`)(github, format))
  );
}
