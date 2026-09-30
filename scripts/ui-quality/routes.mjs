#!/usr/bin/env node
/**
 * routes.mjs — the route inventory: turn each app's router declaration into
 * `RouteTemplate[]`, byte-identical on the same commit
 * (docs/features/ui-quality-loop/architecture.md § Components "Route inventory").
 *
 *   RouteTemplate = {
 *     route:        "book/:venueSlug"   // router-relative, no leading slash; "/" is the root
 *     app:          "hospitality"
 *     kind:         "page" | "redirect" | "not-found"
 *     auth:         "public" | "auth0"
 *     source_files: string[]            // the leaf's own component modules, then the router file(s)
 *   }
 *
 * Parsed with the TypeScript compiler API, never a regex — a `path=` grep
 * matched test files and produced the idea's wrong ~80 (prd.md assumption 1).
 * TypeScript is not resolvable from the repo root, so it is loaded through
 * `createRequire` anchored at apps/hospitality/package.json (no root
 * devDependency, no lockfile touch).
 *
 * I/O is injected (`readFile`, `fileExists`, `listFiles`, `ts`); `createRepoIo`
 * is the real-filesystem binding and the CLI line at the bottom is the only
 * impure caller.
 *
 * Usage:
 *   node scripts/ui-quality/routes.mjs <hospitality|marketing|rialto-web|all>
 *     → JSONL on stdout, sorted by (app, route); exit 2 when an app yields zero routes.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Router file per app — the inputs `generate` / `check` / `changedBy` watch. */
export const HOSPITALITY_ROUTER = "apps/hospitality/src/main.tsx";

/** Thrown when an adapter finds nothing — the CLI maps it to exit 2. */
export class ZeroRoutesError extends Error {}

// ---------------------------------------------------------------------------
// Real-filesystem binding
// ---------------------------------------------------------------------------

/**
 * @param {string} [root]
 * @returns {{ readFile: (rel: string) => string, fileExists: (rel: string) => boolean,
 *   listFiles: (relDir: string) => string[], ts: any }}
 */
export function createRepoIo(root = DEFAULT_ROOT) {
  let ts;
  return {
    readFile: (rel) => readFileSync(join(root, rel), "utf8"),
    fileExists: (rel) => existsSync(join(root, rel)) && statSync(join(root, rel)).isFile(),
    listFiles: (relDir) => listFilesRecursive(root, relDir),
    get ts() {
      ts ??= createRequire(join(root, "apps/hospitality/package.json"))("typescript");
      return ts;
    },
  };
}

function listFilesRecursive(root, relDir) {
  const out = [];
  for (const entry of readdirSync(join(root, relDir), { withFileTypes: true })) {
    const rel = posix.join(relDir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(root, rel));
    else out.push(rel);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// Shared AST helpers
// ---------------------------------------------------------------------------

function parse(ts, fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function walk(ts, node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(ts, child, visit));
}

/** The first dynamic `import("…")` specifier under `node`, or null. */
function dynamicImportSpecifier(ts, node) {
  let found = null;
  walk(ts, node, (n) => {
    if (
      !found &&
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      found = n.arguments[0].text;
    }
  });
  return found;
}

/**
 * identifier → module specifier, for static imports and `lazy(() => import(…))`
 * consts. Other bindings are absent — they are not component modules.
 */
function componentModules(ts, sourceFile) {
  const map = new Map();
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause && !stmt.importClause.isTypeOnly) {
      const spec = stmt.moduleSpecifier.text;
      const clause = stmt.importClause;
      if (clause.name) map.set(clause.name.text, spec);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) map.set(el.name.text, spec);
      }
    }
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const init = decl.initializer;
        if (
          ts.isIdentifier(decl.name) &&
          init &&
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          init.expression.text === "lazy"
        ) {
          const spec = dynamicImportSpecifier(ts, init);
          if (spec) map.set(decl.name.text, spec);
        }
      }
    }
  }
  return map;
}

/** Resolve a relative specifier from `fromFile` to a repo-relative source file. */
function resolveModule(fromFile, spec, fileExists) {
  if (!spec.startsWith(".")) return null;
  const base = posix.join(posix.dirname(fromFile), spec).replace(/\.js$/, "");
  const candidates = /\.tsx?$/.test(base)
    ? [base]
    : [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
  return candidates.find((c) => fileExists(c)) ?? null;
}

/**
 * Component identifiers an element expression renders: JSX tag names plus
 * identifier arguments of calls (`suspended(SignIn)`). Attribute values
 * (`fallback={<LoadingPage />}`) are skipped — a Suspense fallback is not the
 * route's page.
 */
function renderedIdentifiers(ts, element) {
  const names = [];
  const visit = (n) => {
    if (ts.isJsxAttributes(n)) return;
    if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
      if (ts.isIdentifier(n.tagName)) names.push(n.tagName.text);
    }
    if (ts.isCallExpression(n)) {
      for (const arg of n.arguments) if (ts.isIdentifier(arg)) names.push(arg.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(element);
  return names;
}

/** The outermost rendered tag name of an element expression, or null. */
function rootTagName(ts, element) {
  let node = element;
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  if (node && ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
    return node.tagName.text;
  }
  if (node && ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName)) {
    return node.openingElement.tagName.text;
  }
  return null;
}

function isRedirectElement(ts, element) {
  const tag = rootTagName(ts, element);
  return tag === "Navigate" || (tag !== null && tag.endsWith("Redirect"));
}

/** A leaf's kind: a redirect element wins, then the `*` catch-all, then page. */
function kindOf(ts, element, path) {
  if (element && isRedirectElement(ts, element)) return "redirect";
  if (path === "*") return "not-found";
  return "page";
}

function joinRoute(prefix, path) {
  const joined = [prefix, path].filter(Boolean).join("/");
  return joined.replace(/^\/+/, "");
}

function normaliseRoute(route) {
  return route === "" ? "/" : route;
}

/** Object-literal property initializer by name, or undefined. */
function prop(ts, obj, name) {
  const p = obj.properties.find(
    (q) => ts.isPropertyAssignment(q) && q.name && q.name.getText() === name
  );
  return p?.initializer;
}

function sourceFilesFor(ts, element, modules, routerFile, fileExists) {
  const files = new Set();
  if (element) {
    for (const name of renderedIdentifiers(ts, element)) {
      const spec = modules.get(name);
      const file = spec && resolveModule(routerFile, spec, fileExists);
      if (file) files.add(file);
    }
  }
  return [...[...files].sort(), routerFile];
}

// ---------------------------------------------------------------------------
// Object-tree routers (createBrowserRouter / RouteObject[])
// ---------------------------------------------------------------------------

/**
 * Walk a RouteObject[] literal and emit one leaf per route template.
 * A node with `children` is a layout, not a leaf; its `index` child renders at
 * the layout's own path. `authFor(element, inherited)` decides auth.
 */
function walkObjectTree(ts, array, ctx, prefix, auth) {
  const rows = [];
  for (const el of array.elements) {
    if (ts.isSpreadElement(el)) {
      rows.push(...ctx.onSpread(el, prefix, auth));
      continue;
    }
    if (!ts.isObjectLiteralExpression(el)) continue;
    const pathNode = prop(ts, el, "path");
    const path = pathNode && ts.isStringLiteral(pathNode) ? pathNode.text : "";
    const element = prop(ts, el, "element");
    const children = prop(ts, el, "children");
    const nodeAuth = ctx.authFor(element, auth);
    const route = joinRoute(prefix, path);
    if (children && ts.isArrayLiteralExpression(children)) {
      rows.push(...walkObjectTree(ts, children, ctx, route, nodeAuth));
      continue;
    }
    rows.push({
      route: normaliseRoute(route),
      app: ctx.app,
      kind: kindOf(ts, element, path),
      auth: nodeAuth,
      source_files: sourceFilesFor(ts, element, ctx.modules, ctx.routerFile, ctx.fileExists),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/** hospitality: `createBrowserRouter([...])`; every descendant of `<App />` is auth0. */
function hospitalityAdapter(io) {
  const { ts } = io;
  const sf = parse(ts, HOSPITALITY_ROUTER, io.readFile(HOSPITALITY_ROUTER));
  let tree = null;
  walk(ts, sf, (n) => {
    if (
      !tree &&
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "createBrowserRouter" &&
      n.arguments[0] &&
      ts.isArrayLiteralExpression(n.arguments[0])
    ) {
      tree = n.arguments[0];
    }
  });
  if (!tree) return [];
  const ctx = {
    app: "hospitality",
    routerFile: HOSPITALITY_ROUTER,
    modules: componentModules(ts, sf),
    fileExists: io.fileExists,
    authFor: (element, inherited) =>
      inherited === "auth0" || (element && rootTagName(ts, element) === "App") ? "auth0" : "public",
    onSpread: () => {
      throw new Error(`${HOSPITALITY_ROUTER}: unexpected spread in the route tree`);
    },
  };
  return walkObjectTree(ts, tree, ctx, "", "public");
}

export const ADAPTERS = {
  hospitality: hospitalityAdapter,
};

export const APPS = Object.keys(ADAPTERS);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function byAppRoute(a, b) {
  if (a.app !== b.app) return a.app < b.app ? -1 : 1;
  return a.route < b.route ? -1 : a.route > b.route ? 1 : 0;
}

/**
 * One app's route templates, sorted by route. Throws ZeroRoutesError when the
 * adapter finds nothing.
 * @returns {Array<{route: string, app: string, kind: string, auth: string, source_files: string[]}>}
 */
export function extractApp(app, io) {
  const adapter = ADAPTERS[app];
  if (!adapter) throw new Error(`Unknown app "${app}" — expected one of ${APPS.join(", ")}`);
  const rows = adapter(io);
  if (rows.length === 0) {
    throw new ZeroRoutesError(`${app}: the router yielded zero routes — refusing to guess`);
  }
  return [...rows].sort(byAppRoute);
}

/** Every app's route templates, sorted by (app, route). */
export function extractAll(io) {
  return APPS.flatMap((app) => extractApp(app, io)).sort(byAppRoute);
}

/** JSONL, one row per line, trailing newline. */
export function renderRoutes(rows) {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/**
 * CLI body. Returns the exit code; never calls process.exit.
 * @param {string[]} argv
 * @param {object} deps - io plus `stdout` / `stderr` writers
 */
export function main(argv, deps) {
  const [target] = argv;
  try {
    const rows = target === "all" ? extractAll(deps) : extractApp(target, deps);
    deps.stdout(renderRoutes(rows));
    return 0;
  } catch (err) {
    deps.stderr(`routes.mjs: ${err.message}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), {
    ...createRepoIo(),
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  });
}
