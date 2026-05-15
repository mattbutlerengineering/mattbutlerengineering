#!/usr/bin/env npx tsx
/**
 * Rialto Catalog Schema Generator
 *
 * Reads Rialto component prop interfaces via the TypeScript Compiler API and
 * outputs Zod schema definitions to src/generated-schemas.ts.
 *
 * Only includes props directly declared in the component's own source file,
 * not inherited HTML/ARIA attributes from React types.
 *
 * Usage: pnpm --filter @mbe/rialto-catalog generate
 */

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ── Curated component set ───────────────────────── */

const CURATED_COMPONENTS = new Set([
  "Stack",
  "Card",
  "Divider",
  "AspectRatio",
  "Text",
  "Badge",
  "Avatar",
  "Button",
  "Input",
  "Select",
  "Toggle",
  "Checkbox",
  "Tabs",
  "Breadcrumb",
  "NavigationMenu",
  "Alert",
  "Banner",
  "Dialog",
  "Toast",
  "Table",
  "DataList",
  "EmptyState",
  "Accordion",
  "Sidebar",
  "AppBar",
  "Footer",
]);

// Toast is exported as ToastProvider, but we want to catalog its data interface
// We'll handle Toast as a special case via ToastInput props
const COMPONENT_ALIAS: Record<string, string> = {
  Toast: "ToastInput",
};

/* ── Character limits ────────────────────────────── */

interface CharacterLimit {
  component: string;
  prop: string;
  max: number;
}

const CHARACTER_LIMITS: CharacterLimit[] = [
  { component: "Badge", prop: "children", max: 20 },
  { component: "Button", prop: "children", max: 30 },
  { component: "Avatar", prop: "name", max: 30 },
  { component: "Input", prop: "label", max: 40 },
  { component: "Input", prop: "hint", max: 80 },
  { component: "Input", prop: "error", max: 80 },
  { component: "Select", prop: "label", max: 40 },
  { component: "Toggle", prop: "label", max: 30 },
  { component: "Checkbox", prop: "label", max: 30 },
  { component: "Checkbox", prop: "description", max: 80 },
  { component: "Toast", prop: "title", max: 50 },
  { component: "Toast", prop: "description", max: 120 },
  { component: "Alert", prop: "title", max: 60 },
  { component: "Banner", prop: "title", max: 60 },
  { component: "Dialog", prop: "title", max: 60 },
  { component: "Dialog", prop: "description", max: 120 },
  { component: "Card", prop: "title", max: 60 },
  { component: "Card", prop: "subtitle", max: 80 },
  { component: "EmptyState", prop: "heading", max: 50 },
  { component: "EmptyState", prop: "description", max: 300 },
  { component: "Divider", prop: "label", max: 20 },
  { component: "AppBar", prop: "height", max: 20 },
  { component: "Footer", prop: "copyright", max: 80 },
  { component: "Table", prop: "emptyMessage", max: 60 },
];

/* ── Type-to-Zod mapping ─────────────────────────── */

/**
 * Strip " | undefined" from a type string and return {innerType, wasOptional}.
 */
function stripUndefined(typeStr: string): { inner: string; wasOptional: boolean } {
  const parts = typeStr.split(" | ").map((p) => p.trim());
  const withoutUndefined = parts.filter((p) => p !== "undefined");
  const wasOptional = withoutUndefined.length < parts.length;
  return { inner: withoutUndefined.join(" | "), wasOptional };
}

/**
 * Map a TypeScript type string to a Zod schema string.
 * Returns null if the type should be skipped (functions, ReactNode, complex objects/arrays).
 *
 * @param typeStr - The TypeScript type as a string (may include "| undefined")
 * @param isOptional - Whether the prop is optional (from SymbolFlags)
 * @param componentName - Used for character limit lookup
 * @param propName - Used for character limit lookup
 */
function mapTypeToZod(
  typeStr: string,
  isOptional: boolean,
  componentName: string,
  propName: string
): string | null {
  // Strip undefined from the type — we track optionality separately
  const { inner, wasOptional } = stripUndefined(typeStr);
  const optional = isOptional || wasOptional;

  // Skip function types
  if (inner.includes("=>")) {
    return null;
  }

  // Check for character limit
  const limit = CHARACTER_LIMITS.find((l) => l.component === componentName && l.prop === propName);

  // Map ReactNode / JSX types to string (for catalog purpose)
  if (
    inner.includes("ReactNode") ||
    inner.includes("JSX.Element") ||
    inner === "Element" ||
    inner === "ReactNode"
  ) {
    const schema = limit ? `z.string().max(${limit.max})` : "z.string()";
    return optional ? `${schema}.optional()` : schema;
  }

  // Skip complex object/array types that reference Rialto interfaces or ElementType
  if (
    inner.includes("[]") ||
    inner.startsWith("Column<") ||
    inner.includes("ComponentClass") ||
    inner.includes("FunctionComponent") ||
    inner.includes("Ref<") ||
    inner.includes("ForwardedRef")
  ) {
    return null;
  }

  // Boolean (expanded as "false | true" by TS compiler)
  if (inner === "boolean" || inner === "false | true" || inner === "true | false") {
    const schema = "z.boolean()";
    return optional ? `${schema}.optional()` : schema;
  }

  // Number
  if (inner === "number") {
    const schema = "z.number()";
    return optional ? `${schema}.optional()` : schema;
  }

  // String (plain)
  if (inner === "string") {
    const schema = limit ? `z.string().max(${limit.max})` : "z.string()";
    return optional ? `${schema}.optional()` : schema;
  }

  // Union of string literals: "a" | "b" | "c"
  const unionParts = inner.split(" | ").map((p) => p.trim());
  if (
    unionParts.length >= 2 &&
    unionParts.every(
      (p) => (p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))
    )
  ) {
    const values = unionParts.map((p) => `"${p.replace(/^['"]/,  "").replace(/['"]$/, "")}"`);
    const schema = `z.enum([${values.join(", ")}])`;
    return optional ? `${schema}.optional()` : schema;
  }

  // Unrecognized — warn and skip
  console.warn(
    `[generate-catalog] Skipping unrecognized type "${inner}" for ${componentName}.${propName}`
  );
  return null;
}

/* ── Prop info ────────────────────────────────────── */

interface PropSchema {
  propName: string;
  zodExpr: string;
}

/* ── Component extraction ────────────────────── */

/**
 * Check whether a symbol's declaration comes from the Rialto components source directory,
 * as opposed to being inherited from React/TS built-in types.
 */
function isDeclaredInRialto(prop: ts.Symbol, rialtoComponentsDir: string): boolean {
  const decl = prop.declarations?.[0];
  if (!decl) return false;

  const sourceFile = decl.getSourceFile();
  const fileName = sourceFile.fileName;

  // Normalize paths for comparison
  const normalizedFileName = fileName.replace(/\\/g, "/");
  const normalizedComponentsDir = rialtoComponentsDir.replace(/\\/g, "/");

  return normalizedFileName.startsWith(normalizedComponentsDir);
}

/**
 * Resolve type aliases using the TypeChecker.
 * For union types (including optional `T | undefined`), expands to literal members.
 * e.g. StackGap -> '"2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl"'
 * e.g. AlertVariant | undefined -> '"info" | "success" | "warning" | "error" | undefined'
 */
function resolveTypeAlias(prop: ts.Symbol, checker: ts.TypeChecker): string {
  const propType = checker.getTypeOfSymbol(prop);

  // For union types, try to expand the individual members
  if (propType.flags & ts.TypeFlags.Union) {
    const unionType = propType as ts.UnionType;
    const memberStrings = unionType.types.map((t) => {
      // For each union member, if it's a named alias (not a literal/primitive),
      // try to expand it further
      if (t.flags & ts.TypeFlags.Union) {
        // Nested union (type alias expanding to union)
        const nested = t as ts.UnionType;
        return nested.types
          .map((nt) => checker.typeToString(nt, undefined, ts.TypeFormatFlags.NoTruncation))
          .join(" | ");
      }
      return checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
    });
    return memberStrings.join(" | ");
  }

  // For non-union types, use standard expansion
  return checker.typeToString(propType, undefined, ts.TypeFormatFlags.NoTruncation);
}

function extractPropsForInterface(
  propsSymbol: ts.Symbol,
  checker: ts.TypeChecker,
  rialtoComponentsDir: string,
  componentName: string
): PropSchema[] {
  const propsResolved =
    propsSymbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(propsSymbol) : propsSymbol;

  const propsType = checker.getDeclaredTypeOfSymbol(propsResolved);
  const propsProperties = propsType.getProperties();

  const propSchemas: PropSchema[] = [];

  for (const prop of propsProperties) {
    const propName = prop.getName();

    // Skip className, style, id and other HTML utility attributes
    if (["className", "style", "id", "key"].includes(propName)) {
      continue;
    }

    // Only include props declared in Rialto source (not inherited from React/TS types)
    if (!isDeclaredInRialto(prop, rialtoComponentsDir)) {
      continue;
    }

    // Get the resolved type string (handles type aliases)
    const resolvedTypeStr = resolveTypeAlias(prop, checker);

    // Skip children ReactNode — these become slots
    if (propName === "children" && resolvedTypeStr.includes("ReactNode")) {
      continue;
    }

    const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);

    const zodExpr = mapTypeToZod(resolvedTypeStr, isOptional, componentName, propName);

    if (zodExpr === null) {
      continue;
    }

    propSchemas.push({ propName, zodExpr });
  }

  return propSchemas;
}

function extractComponentSchemas(
  program: ts.Program,
  entryFile: string,
  rialtoComponentsDir: string
): Map<string, PropSchema[]> {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entryFile);

  if (!sourceFile) {
    console.error(`Could not find source file: ${entryFile}`);
    return new Map();
  }

  const result = new Map<string, PropSchema[]>();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return result;

  const exports = checker.getExportsOfModule(moduleSymbol);

  for (const exp of exports) {
    const name = exp.getName();

    // Only process curated components
    if (!CURATED_COMPONENTS.has(name)) continue;

    // Find Props interface by convention: ComponentNameProps
    // Use alias if available (e.g. Toast -> ToastInput)
    const propsTypeName = COMPONENT_ALIAS[name] ? COMPONENT_ALIAS[name] : `${name}Props`;

    const propsSymbol = exports.find((e) => e.getName() === propsTypeName);

    if (!propsSymbol) {
      console.warn(`[generate-catalog] No ${propsTypeName} interface found for ${name}`);
      continue;
    }

    const propSchemas = extractPropsForInterface(propsSymbol, checker, rialtoComponentsDir, name);

    result.set(name, propSchemas);
  }

  return result;
}

/* ── Hardcoded fallbacks for components not in barrel exports ── */

/**
 * Components that can't be auto-extracted from the barrel (e.g. Toast which
 * uses a provider pattern and whose data interface isn't barrel-exported).
 * These are hand-authored but still match Rialto source exactly.
 */
const HARDCODED_SCHEMA_LINES: Record<string, string[]> = {
  Toast: [
    "  Toast: z.object({",
    "    title: z.string().max(50),",
    "    description: z.string().max(120).optional(),",
    '    variant: z.enum(["default", "success", "error", "accent"]).optional(),',
    "    duration: z.number().optional(),",
    "  }),",
  ],
};

/* ── Output formatting ───────────────────────────── */

function formatGeneratedSchemas(componentSchemas: Map<string, PropSchema[]>): string {
  const lines: string[] = [
    "// AUTO-GENERATED -- do not edit. Run: pnpm --filter @mbe/rialto-catalog generate",
    'import { z } from "zod";',
    "",
    "export const generatedSchemas = {",
  ];

  // Merge hardcoded schemas with auto-generated ones, then sort alphabetically
  const allNames = new Set([
    ...Array.from(componentSchemas.keys()),
    ...Object.keys(HARDCODED_SCHEMA_LINES),
  ]);
  const sortedNames = Array.from(allNames).sort();

  for (const componentName of sortedNames) {
    // Use hardcoded lines if available (exact string representation)
    if (HARDCODED_SCHEMA_LINES[componentName]) {
      for (const line of HARDCODED_SCHEMA_LINES[componentName]!) {
        lines.push(line);
      }
      continue;
    }

    const props = componentSchemas.get(componentName)!;
    if (props.length === 0) {
      lines.push(`  ${componentName}: z.object({}),`);
    } else {
      lines.push(`  ${componentName}: z.object({`);
      for (const { propName, zodExpr } of props) {
        lines.push(`    ${propName}: ${zodExpr},`);
      }
      lines.push(`  }),`);
    }
  }

  lines.push("} as const;");
  lines.push("");

  return lines.join("\n");
}

/* ── Main ────────────────────────────────────────── */

function main() {
  // Resolve paths relative to packages/rialto-catalog root
  const packageRoot = path.resolve(__dirname, "..");
  const rialtoRoot = path.resolve(packageRoot, "../rialto");
  const rialtoComponentsDir = path.join(rialtoRoot, "src/components");
  const entryFile = path.join(rialtoRoot, "src/components/index.ts");
  const tsconfigPath = path.join(rialtoRoot, "tsconfig.json");
  const outPath = process.env.OUTPUT_FILE
    ? path.resolve(process.cwd(), process.env.OUTPUT_FILE)
    : path.join(packageRoot, "src/generated-schemas.ts");

  if (!fs.existsSync(entryFile)) {
    console.error(`Entry file not found: ${entryFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(tsconfigPath)) {
    console.error(`tsconfig not found: ${tsconfigPath}`);
    process.exit(1);
  }

  // Read tsconfig
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    console.error("Error reading tsconfig:", configFile.error.messageText);
    process.exit(1);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rialtoRoot);

  const program = ts.createProgram([entryFile], parsedConfig.options);

  const componentSchemas = extractComponentSchemas(program, entryFile, rialtoComponentsDir);

  if (componentSchemas.size === 0) {
    console.error("No component schemas extracted — something is wrong");
    process.exit(1);
  }

  const output = formatGeneratedSchemas(componentSchemas);

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, "utf-8");

  console.log(
    `Generated schemas: ${componentSchemas.size} components → ${path.relative(packageRoot, outPath)}`
  );

  // Log component names for visibility
  const sortedNames = Array.from(componentSchemas.keys()).sort();
  console.log(`Components: ${sortedNames.join(", ")}`);

  // Warn about curated components with no schemas
  for (const name of CURATED_COMPONENTS) {
    if (!componentSchemas.has(name) && !HARDCODED_SCHEMA_LINES[name]) {
      console.warn(
        `[generate-catalog] Warning: curated component "${name}" was not found in Rialto exports`
      );
    }
  }
}

main();
