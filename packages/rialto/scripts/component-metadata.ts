/**
 * Canonical component-metadata introspection module for Rialto.
 *
 * Parses `src/components/index.ts` once via the TypeScript Compiler API into a
 * typed ComponentMetadata model that is a superset of every field consumed by
 * the four artifact generators:
 *   - generate-registry.ts  → registry.json
 *   - generate-manifest.ts  → dist/manifest.json
 *   - generate-exports.ts   → package.json exports map
 *   - (rialto-catalog) generate-catalog.ts → generated-schemas.ts / generated-catalog.ts
 *
 * This is the SINGLE source of truth for character limits and component shape.
 * `character-limits.ts` re-exports `characterLimits` + `CharacterLimit` from here.
 */

import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";

/* ── Character limits (canonical definition) ─────────── */

/** Per-component, per-prop character ceiling for AI-generated content. */
export interface CharacterLimit {
  component: string;
  prop: string;
  max: number;
  reason: string;
}

/**
 * Static map of component → prop → max characters.
 * Used by generate-manifest.ts / generate-registry.ts to include limits in
 * emitted JSON, preventing AI-generated content from breaking layouts.
 *
 * Tiers:
 *   Short  (≤30)    — badges, labels, single-line controls
 *   Medium (31–120)  — titles, descriptions, hints
 *   Long   (121–500) — paragraphs, body text
 *   Unrestricted     — ReactNode slots (not listed here)
 */
export const characterLimits: CharacterLimit[] = [
  // ── Short (≤30) ──────────────────────────────
  {
    component: "Badge",
    prop: "children",
    max: 20,
    reason: "Inline status label; wrapping breaks layout",
  },
  {
    component: "Tag",
    prop: "children",
    max: 30,
    reason: "Chip label; must fit single line",
  },
  {
    component: "Kbd",
    prop: "children",
    max: 10,
    reason: "Keyboard shortcut text; very compact",
  },
  {
    component: "Button",
    prop: "children",
    max: 30,
    reason: "Button label; should be concise action verb",
  },
  {
    component: "Tabs",
    prop: "tabs[].label",
    max: 20,
    reason: "Tab labels share horizontal space",
  },
  {
    component: "Breadcrumb",
    prop: "items[].label",
    max: 25,
    reason: "Breadcrumb items share horizontal space",
  },
  {
    component: "Avatar",
    prop: "name",
    max: 30,
    reason: "Used for initials fallback; full name for alt text",
  },
  {
    component: "Stat",
    prop: "label",
    max: 25,
    reason: "Metric label; sits below the value",
  },
  {
    component: "Stat",
    prop: "value",
    max: 15,
    reason: "Metric value; must be scannable",
  },
  {
    component: "Stat",
    prop: "delta",
    max: 10,
    reason: "Trend delta; short numeric change",
  },
  {
    component: "SegmentedControl",
    prop: "segments[].label",
    max: 15,
    reason: "Segments share fixed horizontal space",
  },
  {
    component: "Steps",
    prop: "steps[].label",
    max: 20,
    reason: "Step labels share horizontal space",
  },
  {
    component: "Pagination",
    prop: "aria-label",
    max: 30,
    reason: "Screen reader label; concise context",
  },
  {
    component: "Meter",
    prop: "label",
    max: 25,
    reason: "Gauge label; sits beside or below bar",
  },
  {
    component: "Toggle",
    prop: "label",
    max: 30,
    reason: "Switch label; single line beside control",
  },
  {
    component: "Checkbox",
    prop: "label",
    max: 30,
    reason: "Checkbox label; single line beside control",
  },
  {
    component: "Radio",
    prop: "label",
    max: 30,
    reason: "Radio option label; single line beside control",
  },

  // ── Medium (31–120) ──────────────────────────
  {
    component: "Input",
    prop: "label",
    max: 40,
    reason: "Form field label; above input",
  },
  {
    component: "Input",
    prop: "hint",
    max: 80,
    reason: "Helper text below input; 1-2 lines",
  },
  {
    component: "Input",
    prop: "error",
    max: 80,
    reason: "Error message below input; must be actionable",
  },
  {
    component: "TextArea",
    prop: "label",
    max: 40,
    reason: "Form field label; above textarea",
  },
  {
    component: "NumberInput",
    prop: "label",
    max: 40,
    reason: "Form field label; above input",
  },
  {
    component: "Select",
    prop: "label",
    max: 40,
    reason: "Form field label; above select trigger",
  },
  {
    component: "PinInput",
    prop: "label",
    max: 40,
    reason: "Form field label; above pin cells",
  },
  {
    component: "Slider",
    prop: "label",
    max: 40,
    reason: "Form field label; above slider track",
  },
  {
    component: "RadioGroup",
    prop: "label",
    max: 40,
    reason: "Group label (fieldset legend)",
  },
  {
    component: "Toast",
    prop: "title",
    max: 50,
    reason: "Toast title; must be scannable in ~4s",
  },
  {
    component: "Toast",
    prop: "description",
    max: 120,
    reason: "Toast body; readable before auto-dismiss",
  },
  {
    component: "Alert",
    prop: "title",
    max: 60,
    reason: "Alert heading; single line preferred",
  },
  {
    component: "Banner",
    prop: "title",
    max: 60,
    reason: "Banner heading; single line, full-width",
  },
  {
    component: "Dialog",
    prop: "title",
    max: 60,
    reason: "Dialog heading; fits modal header",
  },
  {
    component: "Dialog",
    prop: "description",
    max: 120,
    reason: "Dialog subtitle; 1-2 lines below title",
  },
  {
    component: "ConfirmDialog",
    prop: "title",
    max: 60,
    reason: "Confirmation heading; clear and direct",
  },
  {
    component: "ConfirmDialog",
    prop: "description",
    max: 120,
    reason: "Confirmation body; explains consequences",
  },
  {
    component: "ConfirmDialog",
    prop: "confirmLabel",
    max: 20,
    reason: "Confirm button text; concise verb",
  },
  {
    component: "Drawer",
    prop: "title",
    max: 60,
    reason: "Drawer heading; fits panel header",
  },
  {
    component: "Card",
    prop: "title",
    max: 60,
    reason: "Card heading; single line",
  },
  {
    component: "Card",
    prop: "subtitle",
    max: 80,
    reason: "Card subheading; 1-2 lines below title",
  },
  {
    component: "EmptyState",
    prop: "title",
    max: 50,
    reason: "Empty state heading; centered, short",
  },
  {
    component: "Accordion",
    prop: "items[].title",
    max: 60,
    reason: "Accordion trigger label; single line",
  },
  {
    component: "Collapsible",
    prop: "label",
    max: 60,
    reason: "Collapsible trigger text; single line",
  },
  {
    component: "Tooltip",
    prop: "content",
    max: 80,
    reason: "Tooltip text; brief hint, no wrapping preferred",
  },
  {
    component: "Divider",
    prop: "label",
    max: 20,
    reason: 'Centered divider label; very short ("or", "and")',
  },
  {
    component: "Checkbox",
    prop: "description",
    max: 80,
    reason: "Help text below checkbox label",
  },
  {
    component: "Timeline",
    prop: "items[].title",
    max: 60,
    reason: "Event title; single line beside node",
  },

  // ── Long (121–500) ───────────────────────────
  {
    component: "Alert",
    prop: "children",
    max: 500,
    reason: "Alert body; paragraph-length contextual message",
  },
  {
    component: "EmptyState",
    prop: "description",
    max: 300,
    reason: "Empty state body; explains what to do next",
  },
  {
    component: "Timeline",
    prop: "items[].description",
    max: 200,
    reason: "Event description; supporting detail",
  },
  {
    component: "Steps",
    prop: "steps[].description",
    max: 80,
    reason: "Step description; sits below label",
  },
];

/* ── Canonical metadata model ─────────────────────────── */

/** Character limit entry embedded in ComponentMetadata (no component field needed). */
export interface CharacterLimitInfo {
  prop: string;
  max: number;
  reason: string;
}

/**
 * Canonical prop descriptor.
 *
 * Fields:
 *  - `type`            — checker.typeToString result (used by manifest + registry)
 *  - `resolvedType`    — union members expanded explicitly (used by catalog Zod generation)
 *  - `declaredInRialto`— true if the prop originates in the rialto components dir
 *                        (catalog filters out HTML-inherited props via this flag)
 */
export interface PropInfo {
  name: string;
  type: string;
  resolvedType: string;
  required: boolean;
  default?: string;
  description?: string;
  declaredInRialto: boolean;
}

/**
 * Canonical metadata for one Rialto component, covering the superset of fields
 * consumed by all four artifact generators.
 */
export interface ComponentMetadata {
  /** Component display name (PascalCase, matching the barrel export). */
  name: string;
  /** Same as `name`; kept explicit for generator clarity. */
  exportIdentifier: string;
  /** Fixed import path for consumers: `"@mattbutlerengineering/rialto"`. */
  importPath: string;
  /** JSDoc description from the Props interface or the component symbol. */
  description?: string;
  /** All props except those classified as slots. */
  props: PropInfo[];
  /** Prop names whose type includes ReactNode (e.g. `["children"]`). */
  slots: string[];
  /** Character limits from the canonical `characterLimits` array. */
  characterLimits: CharacterLimitInfo[];
}

/* ── TS Compiler helpers ──────────────────────────────── */

function getJsDocComment(symbol: ts.Symbol): string | undefined {
  const docs = symbol.getDocumentationComment(undefined);
  if (docs.length === 0) return undefined;
  return (
    docs
      .map((d) => d.text)
      .join("\n")
      .trim() || undefined
  );
}

function typeToString(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
}

/** Byte-order comparator (NOT localeCompare) — locale-sensitive sorts diverge
 * between macOS and Linux CI. See the #2195→#2217 Integrity-failure class. */
const byteOrder = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Expand union members explicitly — mirrors generate-catalog.ts resolveTypeAlias.
 * Members are sorted with the byte comparator so that enum value order in all
 * four generated artifacts is a pure function of the enum's own members, not of
 * TypeScript's program-order (which varies with component-set size). */
function resolveTypeAlias(prop: ts.Symbol, checker: ts.TypeChecker): string {
  const propType = checker.getTypeOfSymbol(prop);

  if (propType.flags & ts.TypeFlags.Union) {
    const unionType = propType as ts.UnionType;
    const memberStrings = unionType.types.map((t) => {
      if (t.flags & ts.TypeFlags.Union) {
        const nested = t as ts.UnionType;
        return nested.types
          .map((nt) => checker.typeToString(nt, undefined, ts.TypeFormatFlags.NoTruncation))
          .sort(byteOrder)
          .join(" | ");
      }
      return checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);
    });
    return memberStrings.sort(byteOrder).join(" | ");
  }

  return checker.typeToString(propType, undefined, ts.TypeFormatFlags.NoTruncation);
}

function getDefaultFromInitializer(symbol: ts.Symbol): string | undefined {
  const decl = symbol.valueDeclaration;
  if (!decl) return undefined;
  if (ts.isBindingElement(decl) && decl.initializer) {
    return decl.initializer.getText();
  }
  return undefined;
}

/** True if the prop's first declaration lives inside the rialto components dir. */
function isDeclaredInRialto(prop: ts.Symbol, rialtoComponentsDir: string): boolean {
  const decl = prop.declarations?.[0];
  if (!decl) return false;
  const fileName = decl.getSourceFile().fileName.replace(/\\/g, "/");
  return fileName.startsWith(rialtoComponentsDir.replace(/\\/g, "/"));
}

/* ── Core extraction ──────────────────────────────────── */

function extractComponents(
  program: ts.Program,
  entryFile: string,
  rialtoComponentsDir: string
): ComponentMetadata[] {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entryFile);
  if (!sourceFile) {
    console.error(`Could not find source file: ${entryFile}`);
    return [];
  }

  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return [];

  const exports = checker.getExportsOfModule(moduleSymbol);
  const components: ComponentMetadata[] = [];

  for (const exp of exports) {
    const name = exp.getName();

    // Skip non-component exports (types, hooks, lowercase utilities)
    if (name.startsWith("use") || name[0] !== name[0].toUpperCase()) continue;
    if (name.endsWith("Props") || name.endsWith("Context")) continue;

    // Resolve aliased symbols
    const resolved = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;

    // Find the Props interface by convention: ComponentNameProps
    const propsTypeName = `${name}Props`;
    const propsSymbol = exports.find((e) => e.getName() === propsTypeName);

    const props: PropInfo[] = [];
    const slots: string[] = [];

    if (propsSymbol) {
      const propsResolved =
        propsSymbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(propsSymbol)
          : propsSymbol;

      const propsType = checker.getDeclaredTypeOfSymbol(propsResolved);

      for (const prop of propsType.getProperties()) {
        const propName = prop.getName();
        const propType = checker.getTypeOfSymbol(prop);
        const propTypeStr = typeToString(propType, checker);

        // Classify ReactNode children as a slot
        if (propName === "children" && propTypeStr.includes("ReactNode")) {
          slots.push("children");
          continue;
        }

        const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);

        const propInfo: PropInfo = {
          name: propName,
          type: propTypeStr,
          resolvedType: resolveTypeAlias(prop, checker),
          required: !isOptional,
          declaredInRialto: isDeclaredInRialto(prop, rialtoComponentsDir),
        };

        const doc = getJsDocComment(prop);
        if (doc) propInfo.description = doc;

        const defaultVal = getDefaultFromInitializer(prop);
        if (defaultVal) propInfo.default = defaultVal;

        props.push(propInfo);
      }
    }

    // Component description from Props JSDoc, falling back to component JSDoc
    let description: string | undefined;
    if (propsSymbol) {
      const propsResolved =
        propsSymbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(propsSymbol)
          : propsSymbol;
      description = getJsDocComment(propsResolved);
    }
    if (!description) {
      description = getJsDocComment(resolved);
    }

    // Character limits from the canonical array
    const compLimits = characterLimits
      .filter((l) => l.component === name)
      .map(({ prop, max, reason }) => ({ prop, max, reason }));

    components.push({
      name,
      exportIdentifier: name,
      importPath: "@mattbutlerengineering/rialto",
      description,
      props,
      slots,
      characterLimits: compLimits,
    });
  }

  // Byte-order comparator (NOT localeCompare): locale-sensitive sorts diverge
  // between macOS and Linux CI, drifting the four generated artifacts. See the
  // #2195→#2217 Integrity-failure class.
  return components.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/* ── Public API ───────────────────────────────────────── */

/**
 * Parse `src/components/index.ts` in the given rialto package root and return
 * a sorted array of ComponentMetadata — the canonical model consumed by all
 * four artifact generators.
 *
 * @param rootDir - Absolute path to the `packages/rialto` directory.
 */
export function introspectComponents(rootDir: string): ComponentMetadata[] {
  const entryFile = path.join(rootDir, "src/components/index.ts");
  const tsconfigPath = path.join(rootDir, "tsconfig.json");
  const rialtoComponentsDir = path.join(rootDir, "src/components");

  if (!fs.existsSync(entryFile)) {
    throw new Error(`Entry file not found: ${entryFile}`);
  }
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error(`tsconfig not found: ${tsconfigPath}`);
  }

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);
  const program = ts.createProgram([entryFile], parsedConfig.options);

  return extractComponents(program, entryFile, rialtoComponentsDir);
}
