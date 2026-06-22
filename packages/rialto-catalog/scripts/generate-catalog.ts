#!/usr/bin/env npx tsx
/**
 * Rialto Catalog Generator (single CatalogSource pass)
 *
 * One pass over the co-located `<Component>.catalog.ts` metadata files in
 * @mattbutlerengineering/rialto produces BOTH generated artifacts:
 *
 *   - src/generated-schemas.ts  — Zod prop schemas (types via the TS Compiler
 *                                 API, character limits from each meta)
 *   - src/generated-catalog.ts  — descriptions / slots / include flags, the
 *                                 data catalog.ts feeds to defineCatalog
 *
 * The set of `*.catalog.ts` files IS the curated include-list, and each meta's
 * `charLimits` is the single source for max-length constraints. This retires
 * the hand-maintained CURATED_COMPONENTS set, the CHARACTER_LIMITS table, and
 * catalog-config.ts. Adding or changing a component is one edit at the source.
 *
 * Usage: pnpm --filter @mbe/rialto-catalog generate
 */

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import type { CatalogMeta } from "../../rialto/src/components/catalog-meta.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ── Co-located metadata discovery ───────────────── */

/** Recursively collect every `*.catalog.ts` file under the components dir. */
function findCatalogMetaFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findCatalogMetaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".catalog.ts")) {
      found.push(full);
    }
  }
  return found;
}

/** Dynamically import a `*.catalog.ts` file and return its single exported meta. */
async function loadCatalogMeta(file: string): Promise<CatalogMeta> {
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const meta = Object.values(mod).find(
    (v): v is CatalogMeta =>
      typeof v === "object" && v !== null && typeof (v as CatalogMeta).name === "string"
  );
  if (!meta) {
    throw new Error(`No CatalogMeta export found in ${file}`);
  }
  return meta;
}

/* ── Component name → Props interface alias ──────── */

// Toast is exported as ToastProvider; its data interface is ToastInput.
const COMPONENT_ALIAS: Record<string, string> = {
  Toast: "ToastInput",
};

/* ── Type-to-Zod mapping ─────────────────────────── */

/** Strip " | undefined" from a type string and return {inner, wasOptional}. */
function stripUndefined(typeStr: string): { inner: string; wasOptional: boolean } {
  const parts = typeStr.split(" | ").map((p) => p.trim());
  const withoutUndefined = parts.filter((p) => p !== "undefined");
  const wasOptional = withoutUndefined.length < parts.length;
  return { inner: withoutUndefined.join(" | "), wasOptional };
}

/**
 * Map a TypeScript type string to a Zod schema string.
 * Returns null if the type should be skipped (functions, complex objects/arrays).
 *
 * @param maxLen - Character limit for this prop, from the component's meta.
 */
function mapTypeToZod(
  typeStr: string,
  isOptional: boolean,
  maxLen: number | undefined
): string | null {
  const { inner, wasOptional } = stripUndefined(typeStr);
  const optional = isOptional || wasOptional;

  // Skip function types
  if (inner.includes("=>")) {
    return null;
  }

  // Map ReactNode / JSX types to string (for catalog purpose)
  if (
    inner.includes("ReactNode") ||
    inner.includes("JSX.Element") ||
    inner === "Element" ||
    inner === "ReactNode"
  ) {
    const schema = maxLen !== undefined ? `z.string().max(${maxLen})` : "z.string()";
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
    const schema = maxLen !== undefined ? `z.string().max(${maxLen})` : "z.string()";
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
    const values = unionParts.map((p) => `"${p.replace(/^['"]/, "").replace(/['"]$/, "")}"`);
    const schema = `z.enum([${values.join(", ")}])`;
    return optional ? `${schema}.optional()` : schema;
  }

  // Unrecognized — warn and skip
  console.warn(`[generate-catalog] Skipping unrecognized type "${inner}"`);
  return null;
}

/* ── Prop info ────────────────────────────────────── */

interface PropSchema {
  propName: string;
  zodExpr: string;
}

/* ── Component extraction ────────────────────── */

/** Check whether a symbol's declaration comes from the Rialto components dir. */
function isDeclaredInRialto(prop: ts.Symbol, rialtoComponentsDir: string): boolean {
  const decl = prop.declarations?.[0];
  if (!decl) return false;

  const fileName = decl.getSourceFile().fileName.replace(/\\/g, "/");
  const componentsDir = rialtoComponentsDir.replace(/\\/g, "/");

  return fileName.startsWith(componentsDir);
}

/** Resolve type aliases using the TypeChecker, expanding union members. */
function resolveTypeAlias(prop: ts.Symbol, checker: ts.TypeChecker): string {
  const propType = checker.getTypeOfSymbol(prop);

  if (propType.flags & ts.TypeFlags.Union) {
    const unionType = propType as ts.UnionType;
    const memberStrings = unionType.types.map((t) => {
      if (t.flags & ts.TypeFlags.Union) {
        const nested = t as ts.UnionType;
        return nested.types
          .map((nt) => checker.typeToString(nt, undefined, ts.TypeFormatFlags.NoTruncation))
          .join(" | ");
      }
      return checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
    });
    return memberStrings.join(" | ");
  }

  return checker.typeToString(propType, undefined, ts.TypeFormatFlags.NoTruncation);
}

function extractPropsForInterface(
  propsSymbol: ts.Symbol,
  checker: ts.TypeChecker,
  rialtoComponentsDir: string,
  charLimits: Readonly<Record<string, number>> | undefined
): PropSchema[] {
  const propsResolved =
    propsSymbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(propsSymbol) : propsSymbol;

  const propsType = checker.getDeclaredTypeOfSymbol(propsResolved);
  const propsProperties = propsType.getProperties();

  const propSchemas: PropSchema[] = [];

  for (const prop of propsProperties) {
    const propName = prop.getName();

    if (["className", "style", "id", "key"].includes(propName)) {
      continue;
    }

    if (!isDeclaredInRialto(prop, rialtoComponentsDir)) {
      continue;
    }

    const resolvedTypeStr = resolveTypeAlias(prop, checker);

    if (propName === "children" && resolvedTypeStr.includes("ReactNode")) {
      continue;
    }

    const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);
    const maxLen = charLimits?.[propName];

    const zodExpr = mapTypeToZod(resolvedTypeStr, isOptional, maxLen);

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
  rialtoComponentsDir: string,
  metas: Map<string, CatalogMeta>
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

    // Only process components that declared co-located metadata.
    if (!metas.has(name)) continue;

    const propsTypeName = COMPONENT_ALIAS[name] ?? `${name}Props`;
    const propsSymbol = exports.find((e) => e.getName() === propsTypeName);

    if (!propsSymbol) {
      console.warn(`[generate-catalog] No ${propsTypeName} interface found for ${name}`);
      continue;
    }

    const propSchemas = extractPropsForInterface(
      propsSymbol,
      checker,
      rialtoComponentsDir,
      metas.get(name)!.charLimits
    );

    result.set(name, propSchemas);
  }

  return result;
}

/* ── Hardcoded fallbacks for components not in barrel exports ── */

/**
 * Components whose Props interface isn't barrel-exported (Toast uses a provider
 * pattern). Hand-authored, but its character limits still come from the meta so
 * there is still a single source — the lines below must match Toast.catalog.ts.
 */
function hardcodedSchemaLines(metas: Map<string, CatalogMeta>): Record<string, string[]> {
  const toast = metas.get("Toast");
  const titleMax = toast?.charLimits?.title ?? 50;
  const descMax = toast?.charLimits?.description ?? 120;
  return {
    Toast: [
      "  Toast: z.object({",
      `    title: z.string().max(${titleMax}),`,
      `    description: z.string().max(${descMax}).optional(),`,
      '    variant: z.enum(["default", "success", "error", "accent"]).optional(),',
      "    duration: z.number().optional(),",
      "  }),",
    ],
  };
}

/* ── Output formatting ───────────────────────────── */

function formatGeneratedSchemas(
  componentSchemas: Map<string, PropSchema[]>,
  hardcoded: Record<string, string[]>
): string {
  const lines: string[] = [
    "// AUTO-GENERATED -- do not edit. Run: pnpm --filter @mbe/rialto-catalog generate",
    'import { z } from "zod";',
    "",
    "export const generatedSchemas = {",
  ];

  const allNames = new Set([...componentSchemas.keys(), ...Object.keys(hardcoded)]);
  const sortedNames = Array.from(allNames).sort();

  for (const componentName of sortedNames) {
    if (hardcoded[componentName]) {
      for (const line of hardcoded[componentName]!) {
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

/** Format a string→primitive record as a prettier-style inline object literal. */
function inlineRecord(record: Readonly<Record<string, string | number>>): string {
  const entries = Object.entries(record).map(([k, v]) => {
    const key = /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
    return `${key}: ${JSON.stringify(v)}`;
  });
  return `{ ${entries.join(", ")} }`;
}

/** Serialize the catalog metadata (descriptions/slots/include) into a typed module. */
function formatGeneratedCatalog(metas: Map<string, CatalogMeta>): string {
  const lines: string[] = [
    "// AUTO-GENERATED -- do not edit. Run: pnpm --filter @mbe/rialto-catalog generate",
    "// Co-located metadata from packages/rialto/src/components/<Component>/<Component>.catalog.ts",
    'import type { CatalogMeta } from "./catalog-meta.js";',
    "",
    "export const catalogMeta: Record<string, CatalogMeta> = {",
  ];

  for (const name of Array.from(metas.keys()).sort()) {
    const meta = metas.get(name)!;
    lines.push(`  ${name}: {`);
    lines.push(`    name: ${JSON.stringify(meta.name)},`);
    if (meta.include === false) {
      lines.push("    include: false,");
    }
    lines.push(`    description:`);
    lines.push(`      ${JSON.stringify(meta.description)},`);
    if (meta.slots && meta.slots.length > 0) {
      lines.push(`    slots: ${JSON.stringify(meta.slots)},`);
    }
    if (meta.charLimits && Object.keys(meta.charLimits).length > 0) {
      lines.push(`    charLimits: ${inlineRecord(meta.charLimits)},`);
    }
    if (meta.aliases && Object.keys(meta.aliases).length > 0) {
      lines.push(`    aliases: ${inlineRecord(meta.aliases)},`);
    }
    lines.push("  },");
  }

  lines.push("};");
  lines.push("");

  return lines.join("\n");
}

/* ── Main ────────────────────────────────────────── */

async function main() {
  const packageRoot = path.resolve(__dirname, "..");
  const rialtoRoot = path.resolve(packageRoot, "../rialto");
  const rialtoComponentsDir = path.join(rialtoRoot, "src/components");
  const entryFile = path.join(rialtoComponentsDir, "index.ts");
  const tsconfigPath = path.join(rialtoRoot, "tsconfig.json");

  const schemasOut = process.env.OUTPUT_FILE
    ? path.resolve(process.cwd(), process.env.OUTPUT_FILE)
    : path.join(packageRoot, "src/generated-schemas.ts");
  const catalogOut = process.env.CATALOG_OUTPUT_FILE
    ? path.resolve(process.cwd(), process.env.CATALOG_OUTPUT_FILE)
    : path.join(packageRoot, "src/generated-catalog.ts");

  if (!fs.existsSync(entryFile)) {
    console.error(`Entry file not found: ${entryFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(tsconfigPath)) {
    console.error(`tsconfig not found: ${tsconfigPath}`);
    process.exit(1);
  }

  // 1. Discover + load the co-located metadata — the single source of truth.
  const metaFiles = findCatalogMetaFiles(rialtoComponentsDir);
  const metas = new Map<string, CatalogMeta>();
  for (const file of metaFiles) {
    const meta = await loadCatalogMeta(file);
    metas.set(meta.name, meta);
  }

  if (metas.size === 0) {
    console.error("No *.catalog.ts metadata files found — something is wrong");
    process.exit(1);
  }

  // 2. Extract Zod schemas via the TS Compiler API, honoring meta char limits.
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    console.error("Error reading tsconfig:", configFile.error.messageText);
    process.exit(1);
  }
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rialtoRoot);
  const program = ts.createProgram([entryFile], parsedConfig.options);

  const componentSchemas = extractComponentSchemas(program, entryFile, rialtoComponentsDir, metas);

  const hardcoded = hardcodedSchemaLines(metas);

  if (componentSchemas.size === 0 && Object.keys(hardcoded).length === 0) {
    console.error("No component schemas extracted — something is wrong");
    process.exit(1);
  }

  // 3. Emit both artifacts from the single source.
  fs.mkdirSync(path.dirname(schemasOut), { recursive: true });
  fs.writeFileSync(schemasOut, formatGeneratedSchemas(componentSchemas, hardcoded), "utf-8");

  fs.mkdirSync(path.dirname(catalogOut), { recursive: true });
  fs.writeFileSync(catalogOut, formatGeneratedCatalog(metas), "utf-8");

  console.log(
    `Generated catalog: ${metas.size} components → ${path.relative(packageRoot, schemasOut)}, ${path.relative(packageRoot, catalogOut)}`
  );
  console.log(`Components: ${Array.from(metas.keys()).sort().join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
