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
 * Character limits come from two co-located sources this module unifies into
 * one vocabulary on the model:
 *   - Each cataloged component's `*.catalog.ts` `charLimits` (ADR-013) is the
 *     source for flat per-prop limits; `introspectComponents()` merges them.
 *   - The static `characterLimits` array below holds only the residue those
 *     flat catalog limits cannot express: path-style nested limits
 *     (`tabs[].label`), ReactNode-slot limits (`children`), and limits on
 *     components that have no `*.catalog.ts`.
 * Every limit (from either source) is checked against the component's real
 * props/slots by `assertCharacterLimitsResolve()`, so a limit for a prop that
 * does not exist fails generation instead of silently shipping.
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
 * Residue character limits that the flat per-prop `charLimits` in each
 * `*.catalog.ts` cannot express. `introspectComponents()` merges these with the
 * catalog limits into `ComponentMetadata.characterLimits`, which
 * generate-manifest.ts / generate-registry.ts emit to keep AI-generated content
 * from breaking layouts.
 *
 * Only three kinds of limit live here — everything else is a catalog `charLimit`:
 *   - Path-style nested limits on array-item fields (`tabs[].label`): the flat
 *     `Record<prop, max>` catalog shape has no key for a nested field.
 *   - ReactNode-slot limits (`children`, `trigger`): the catalog drift check
 *     requires every `charLimits` key to be a generated Zod field, and slots are
 *     excluded from that schema, so slot limits cannot be catalog keys.
 *   - Limits on components that have no co-located `*.catalog.ts`.
 *
 * Every entry is validated against the component's real props/slots by
 * `assertCharacterLimitsResolve()` (a nested `root[].leaf` limit validates `root`).
 */
export const characterLimits: CharacterLimit[] = [
  // ── Nested array-item fields (flat catalog charLimits cannot key these) ──
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
    component: "Steps",
    prop: "steps[].description",
    max: 80,
    reason: "Step description; sits below label",
  },
  {
    component: "Accordion",
    prop: "items[].title",
    max: 60,
    reason: "Accordion trigger label; single line",
  },
  {
    component: "Timeline",
    prop: "events[].title",
    max: 60,
    reason: "Event title; single line beside node",
  },
  {
    component: "Timeline",
    prop: "events[].description",
    max: 200,
    reason: "Event description; supporting detail",
  },

  // ── ReactNode-slot limits (slots are not catalog schema fields) ──
  {
    component: "Badge",
    prop: "children",
    max: 20,
    reason: "Inline status label; wrapping breaks layout",
  },
  {
    component: "Button",
    prop: "children",
    max: 30,
    reason: "Button label; should be concise action verb",
  },
  {
    component: "Alert",
    prop: "children",
    max: 500,
    reason: "Alert body; paragraph-length contextual message",
  },
  {
    component: "Collapsible",
    prop: "trigger",
    max: 60,
    reason: "Collapsible trigger text; single line",
  },

  // ── Components with no co-located *.catalog.ts ──
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
    component: "Meter",
    prop: "label",
    max: 25,
    reason: "Gauge label; sits beside or below bar",
  },
  {
    component: "Radio",
    prop: "label",
    max: 30,
    reason: "Radio option label; single line beside control",
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
    component: "Tooltip",
    prop: "content",
    max: 80,
    reason: "Tooltip text; brief hint, no wrapping preferred",
  },
];

/* ── Canonical metadata model ─────────────────────────── */

/**
 * Character limit entry embedded in ComponentMetadata (no component field needed).
 * `reason` is present only for residue limits from the static `characterLimits`
 * array; catalog-sourced limits (`*.catalog.ts` `charLimits`) carry no reason.
 */
export interface CharacterLimitInfo {
  prop: string;
  max: number;
  reason?: string;
}

/**
 * Canonical prop descriptor.
 *
 * Fields:
 *  - `type`            — checker.typeToString result (used by manifest + registry)
 *  - `resolvedType`    — union members expanded explicitly (used by catalog Zod generation)
 *  - `declaredInRialto`— true if the prop originates in the rialto package src
 *                        root (components, providers, …); false for
 *                        HTMLAttributes bleed-through. Consumers (manifest,
 *                        registry, catalog) filter inherited HTML props via it.
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
  /**
   * Package.json exports subpath segment (the directory name under
   * `src/components/`).  For most components this equals `name`; for
   * components where the export name differs from the directory (e.g.
   * `ToastProvider` in `src/components/Toast/`) this is the directory name
   * (e.g. `"Toast"`).  Used by generate-exports.ts to build the `./Toast`
   * subpath without falling back to a filesystem scan.
   */
  subpath: string;
  /** JSDoc description from the Props interface or the component symbol. */
  description?: string;
  /** All props except those classified as slots. */
  props: PropInfo[];
  /** Prop names whose type includes ReactNode (e.g. `["children"]`). */
  slots: string[];
  /** Merged limits: catalog `charLimits` + the static residue, sorted by prop. */
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

/** True if the prop's first declaration lives inside the rialto package `src`
 * root (providers, components, hooks, etc.) — i.e. it is rialto-authored
 * source. Returns false for HTMLAttributes bleed-through, whose declarations
 * live in `node_modules`/`lib.dom.d.ts`, never under our `src` tree. */
function isDeclaredInRialto(prop: ts.Symbol, rialtoSrcDir: string): boolean {
  const decl = prop.declarations?.[0];
  if (!decl) return false;
  const fileName = decl.getSourceFile().fileName.replace(/\\/g, "/");
  const boundary = rialtoSrcDir.replace(/\\/g, "/");
  // Trailing separator so `src` cannot spuriously match a sibling like
  // `src-legacy`; every real source file is `src/<subdir>/…`.
  return fileName.startsWith(boundary.endsWith("/") ? boundary : `${boundary}/`);
}

/**
 * Derive the package.json exports subpath (directory name) for a component
 * from where its symbol is declared.
 *
 * For `Button` declared in `src/components/Button/Button.tsx` → `"Button"`.
 * For `ToastProvider` declared in `src/components/Toast/Toast.tsx` → `"Toast"`.
 * Falls back to the export name when the declaration can't be located.
 */
function getComponentSubpath(
  resolved: ts.Symbol,
  name: string,
  rialtoComponentsDir: string
): string {
  const decl = resolved.declarations?.[0];
  if (!decl) return name;
  const declDir = path.dirname(decl.getSourceFile().fileName);
  const relative = path.relative(rialtoComponentsDir, declDir);
  // Take the first segment only (immediate child of componentsDir).
  const segment = relative.split(path.sep)[0];
  return segment && segment !== ".." ? segment : name;
}

/* ── Catalog charLimits merge + validation ─────────────── */

/** Root prop a limit resolves against: `tabs[].label` → `tabs`, `heading` → `heading`. */
function limitRootProp(prop: string): string {
  const bracket = prop.indexOf("[");
  return bracket === -1 ? prop : prop.slice(0, bracket);
}

/**
 * Statically read every `*.catalog.ts` under `componentsDir` and return a map
 * of component `name` → its `charLimits` record. Parsed via the TS AST (not a
 * runtime import) so introspection stays synchronous and never executes catalog
 * modules. Discovery + name-keying mirror generate-catalog.ts.
 */
function loadCatalogCharLimits(componentsDir: string): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();
  if (!fs.existsSync(componentsDir)) return result;

  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".catalog.ts")) files.push(full);
    }
  };
  walk(componentsDir);
  files.sort(byteOrder);

  for (const file of files) {
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true
    );

    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        let init = decl.initializer;
        if (init && ts.isSatisfiesExpression(init)) init = init.expression;
        if (!init || !ts.isObjectLiteralExpression(init)) continue;

        const nameProp = init.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && p.name.getText(sf) === "name"
        );
        if (!nameProp || !ts.isStringLiteral(nameProp.initializer)) continue;
        const componentName = nameProp.initializer.text;

        const limitsProp = init.properties.find(
          (p): p is ts.PropertyAssignment =>
            ts.isPropertyAssignment(p) && p.name.getText(sf) === "charLimits"
        );
        if (!limitsProp || !ts.isObjectLiteralExpression(limitsProp.initializer)) continue;

        const limits: Record<string, number> = {};
        for (const p of limitsProp.initializer.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const key =
            ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : undefined;
          if (key === undefined || !ts.isNumericLiteral(p.initializer)) continue;
          limits[key] = Number(p.initializer.text);
        }
        if (Object.keys(limits).length > 0) result.set(componentName, limits);
      }
    }
  }

  return result;
}

/**
 * Throw if any character limit references a prop outside the component's real
 * API. The valid set is the rialto-authored props (`declaredInRialto`) plus
 * slots — exactly what manifest/registry publish. Inherited HTML attributes are
 * excluded on purpose: `EmptyState.title` is the global HTML `title` attribute,
 * not the component's heading prop, so limiting it shipped a ceiling for a prop
 * absent from the published API. A flat limit (`heading`) must be such a prop or
 * a slot; a nested limit (`events[].title`) validates its root array prop
 * (`events`). This is the one check that catches the EmptyState `title`→`heading`
 * drift.
 */
export function assertCharacterLimitsResolve(components: ComponentMetadata[]): void {
  const violations: string[] = [];
  for (const comp of components) {
    const known = new Set<string>([
      ...comp.props.filter((p) => p.declaredInRialto).map((p) => p.name),
      ...comp.slots,
    ]);
    for (const limit of comp.characterLimits) {
      if (!known.has(limitRootProp(limit.prop))) violations.push(`${comp.name}.${limit.prop}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Character limits reference props that do not exist: ${violations.join(", ")}. ` +
        `Fix the *.catalog.ts charLimits or the static characterLimits residue so every ` +
        `limit names a real prop (or the root array prop for nested limits).`
    );
  }
}

/* ── Core extraction ──────────────────────────────────── */

function extractComponents(
  program: ts.Program,
  entryFile: string,
  rialtoComponentsDir: string,
  rialtoSrcDir: string,
  catalogCharLimits: Map<string, Record<string, number>>
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
          declaredInRialto: isDeclaredInRialto(prop, rialtoSrcDir),
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

    // Character limits: catalog charLimits (flat, per real prop) merged with the
    // static residue (nested + slot + non-cataloged). Catalog wins on a prop
    // conflict; the merged list is byte-sorted by prop for stable artifacts.
    const limitsByProp = new Map<string, CharacterLimitInfo>();
    const catalog = catalogCharLimits.get(name);
    if (catalog) {
      for (const [prop, max] of Object.entries(catalog)) limitsByProp.set(prop, { prop, max });
    }
    for (const l of characterLimits) {
      if (l.component !== name || limitsByProp.has(l.prop)) continue;
      limitsByProp.set(l.prop, { prop: l.prop, max: l.max, reason: l.reason });
    }
    const compLimits = [...limitsByProp.values()].sort((a, b) => byteOrder(a.prop, b.prop));

    components.push({
      name,
      exportIdentifier: name,
      importPath: "@mattbutlerengineering/rialto",
      subpath: getComponentSubpath(resolved, name, rialtoComponentsDir),
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
  // Subpath derivation keys off the components dir (immediate child = subpath).
  const rialtoComponentsDir = path.join(rootDir, "src/components");
  // declaredInRialto keys off the whole src root, so props authored in
  // src/providers (e.g. RialtoProviderProps) count as rialto-authored and are
  // not mistaken for HTMLAttributes bleed-through from node_modules/lib.dom.
  const rialtoSrcDir = path.join(rootDir, "src");

  if (!fs.existsSync(entryFile)) {
    throw new Error(`Entry file not found: ${entryFile}`);
  }
  if (!fs.existsSync(tsconfigPath)) {
    throw new Error(`tsconfig not found: ${tsconfigPath}`);
  }

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);
  const program = ts.createProgram([entryFile], parsedConfig.options);

  const catalogCharLimits = loadCatalogCharLimits(rialtoComponentsDir);
  const components = extractComponents(
    program,
    entryFile,
    rialtoComponentsDir,
    rialtoSrcDir,
    catalogCharLimits
  );

  // Fail generation loudly on drift rather than shipping a limit for a prop that
  // does not exist (the EmptyState `title`→`heading` class of bug).
  assertCharacterLimitsResolve(components);
  return components;
}
