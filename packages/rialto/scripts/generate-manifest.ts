#!/usr/bin/env npx tsx
/**
 * Rialto Component Manifest Generator
 *
 * Parses the barrel export at src/components/index.ts using the TypeScript
 * Compiler API to extract component names, props interfaces (with types,
 * defaults, and JSDoc), and outputs dist/manifest.json.
 *
 * Usage: npx tsx scripts/generate-manifest.ts
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { characterLimits } from './character-limits.js';

/* ── Types ───────────────────────────────────── */

interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

interface CharacterLimitInfo {
  prop: string;
  max: number;
  reason: string;
}

interface ComponentInfo {
  name: string;
  description?: string;
  props: PropInfo[];
  slots: string[];
  characterLimits?: CharacterLimitInfo[];
}

interface Manifest {
  version: string;
  generatedAt: string;
  components: ComponentInfo[];
}

/* ── Helpers ─────────────────────────────────── */

function getJsDocComment(symbol: ts.Symbol): string | undefined {
  const docs = symbol.getDocumentationComment(undefined);
  if (docs.length === 0) return undefined;
  return (
    docs
      .map((d) => d.text)
      .join('\n')
      .trim() || undefined
  );
}

function typeToString(type: ts.Type, checker: ts.TypeChecker): string {
  return checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation);
}

function getDefaultFromInitializer(symbol: ts.Symbol): string | undefined {
  const decl = symbol.valueDeclaration;
  if (!decl) return undefined;

  // Look for destructuring default: { variant = 'secondary' }
  if (ts.isBindingElement(decl) && decl.initializer) {
    return decl.initializer.getText();
  }
  return undefined;
}

/* ── Component extraction ────────────────────── */

function extractComponents(
  program: ts.Program,
  entryFile: string
): ComponentInfo[] {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(entryFile);
  if (!sourceFile) {
    console.error(`Could not find source file: ${entryFile}`);
    return [];
  }

  const components: ComponentInfo[] = [];
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return components;

  const exports = checker.getExportsOfModule(moduleSymbol);

  for (const exp of exports) {
    const name = exp.getName();

    // Skip non-component exports (types, hooks, constants)
    if (name.startsWith('use') || name[0] !== name[0].toUpperCase()) continue;
    if (name.endsWith('Props') || name.endsWith('Context')) continue;

    // Resolve aliased symbols
    const resolved =
      exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;

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
      const propsProperties = propsType.getProperties();

      for (const prop of propsProperties) {
        const propName = prop.getName();
        const propType = checker.getTypeOfSymbol(prop);
        const propTypeStr = typeToString(propType, checker);

        // Detect slots (ReactNode children)
        if (propName === 'children' && propTypeStr.includes('ReactNode')) {
          slots.push('children');
          continue;
        }

        // Check if optional
        const isOptional = !!(prop.flags & ts.SymbolFlags.Optional);

        const propInfo: PropInfo = {
          name: propName,
          type: propTypeStr,
          required: !isOptional,
        };

        // JSDoc
        const doc = getJsDocComment(prop);
        if (doc) propInfo.description = doc;

        // Default value from destructuring
        const defaultVal = getDefaultFromInitializer(prop);
        if (defaultVal) propInfo.default = defaultVal;

        props.push(propInfo);
      }
    }

    // Component-level JSDoc
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

    components.push({
      name,
      description,
      props,
      slots,
    });
  }

  return components;
}

/* ── Main ────────────────────────────────────── */

function main() {
  const rootDir = process.cwd();
  const entryFile = path.join(rootDir, 'src/components/index.ts');
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  const outPath = path.join(rootDir, 'dist/manifest.json');

  // Read tsconfig
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    rootDir
  );

  const program = ts.createProgram([entryFile], parsedConfig.options);

  const components = extractComponents(program, entryFile);

  // Merge character limits into component data
  for (const component of components) {
    const limits = characterLimits.filter(
      (l) => l.component === component.name
    );
    if (limits.length > 0) {
      component.characterLimits = limits.map(({ prop, max, reason }) => ({
        prop,
        max,
        reason,
      }));
    }
  }

  // Read version from package.json
  const pkg = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
  );

  const manifest: Manifest = {
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    components: components.sort((a, b) => a.name.localeCompare(b.name)),
  };

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(
    `Generated manifest: ${components.length} components → ${outPath}`
  );
}

main();
