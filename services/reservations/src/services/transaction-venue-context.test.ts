import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ts from "typescript";

/**
 * Local, DB-free proof that every interactive `$transaction(async (tx) => ...)`
 * under `src/` either sets the Postgres venue context first or says why it
 * does not (ADR-026). An unscoped transaction reads zero rows or silently
 * writes nothing under RLS, and a misplaced write path can skip the venue check
 * entirely (#8656, `c17b303a6`). Array-form `$transaction([...])` is out of
 * scope: each wrapped call carries its own scope.
 *
 * A callback is scoped when the first thing it does with its transaction
 * parameter is pass it to `setVenueContext(...)` or to a function listed in
 * `VENUE_CONTEXT_HELPERS`. Anything else must be in `UNSCOPED_TRANSACTIONS`,
 * keyed `"<file relative to src>:<enclosing function>"` (no line numbers, so
 * edits do not churn it). Unlisted sites and stale entries both fail.
 */
type UnscopedReason =
  | "all-venue cron"
  | "venue resolution by slug"
  | "platform admin"
  | "user-scoped cross-venue read"
  | "the scoping wrapper itself";

// Every site below assumes `app_reservations` via `assumeAppRole` and reads
// through a SECURITY DEFINER function (ADR-026 §3.1), except the wrapper,
// which sets context through its `dynamicTx` alias.
const UNSCOPED_TRANSACTIONS: Readonly<Record<string, UnscopedReason>> = {
  "services/lapsed-guest-cron.ts:getAllVenueIds": "all-venue cron",
  "services/resolve-venue.ts:resolveVenueId": "venue resolution by slug",
  "services/venue.ts:list": "platform admin",
  "services/reservation.ts:listByUserId": "user-scoped cross-venue read",
  "services/venue-scoped-prisma.ts:get": "the scoping wrapper itself",
};

/** Functions that set venue context on the transaction handed to them. */
const VENUE_CONTEXT_HELPERS: Readonly<Record<string, string>> = {};

const SRC_ROOT = fileURLToPath(new URL("..", import.meta.url));

function listSourceFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "generated" ? [] : listSourceFiles(full);
    }
    const isSource = entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts");
    const isTest = /\.(test|spec)\.ts$/.test(entry.name);
    return isSource && !isTest ? [full] : [];
  });
}

type FunctionLike =
  ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration | ts.MethodDeclaration;

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node)
  );
}

function nameOf(node: ts.Node): string | undefined {
  if (!isFunctionLike(node)) return undefined;
  if (node.name !== undefined) return node.name.getText();
  // `const fn = async () => ...` / `{ fn: async () => ... }`
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) {
    return parent.name.getText();
  }
  return undefined;
}

/** Nearest named ancestor of the `$transaction` call, ignoring anonymous closures. */
function enclosingName(call: ts.CallExpression): string {
  for (let node: ts.Node | undefined = call.parent; node; node = node.parent) {
    const name = nameOf(node);
    if (name !== undefined) return name;
  }
  return "<module>";
}

function firstTxUse(callback: FunctionLike, txName: string): ts.Identifier | undefined {
  let first: ts.Identifier | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === txName && !isDeclarationName(node)) {
      if (first === undefined || node.getStart() < first.getStart()) first = node;
    }
    ts.forEachChild(node, visit);
  };
  if (callback.body) visit(callback.body);
  return first;
}

function isDeclarationName(id: ts.Identifier): boolean {
  const parent = id.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === id) ||
    (ts.isPropertyAssignment(parent) && parent.name === id)
  );
}

function setsContextFirst(callback: FunctionLike, helpers: ReadonlySet<string>): boolean {
  const param = callback.parameters[0];
  if (param === undefined || !ts.isIdentifier(param.name)) return false;
  const use = firstTxUse(callback, param.name.text);
  const parent = use?.parent;
  if (parent === undefined || !ts.isCallExpression(parent)) return false;
  if (!parent.arguments.includes(use as ts.Expression)) return false;
  const callee = ts.isIdentifier(parent.expression)
    ? parent.expression.text
    : ts.isPropertyAccessExpression(parent.expression)
      ? parent.expression.name.text
      : "";
  return callee === "setVenueContext" || helpers.has(callee);
}

interface TransactionSite {
  readonly key: string;
  readonly scoped: boolean;
}

function findSites(file: string, helpers: ReadonlySet<string>): readonly TransactionSite[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const rel = relative(SRC_ROOT, file).split(sep).join("/");
  const sites: TransactionSite[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "$transaction"
    ) {
      const callback = node.arguments[0];
      if (callback !== undefined && isFunctionLike(callback)) {
        sites.push({
          key: `${rel}:${enclosingName(node)}`,
          scoped: setsContextFirst(callback, helpers),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

function scanAll(helpers: ReadonlySet<string>): readonly TransactionSite[] {
  return listSourceFiles(SRC_ROOT).flatMap((file) => findSites(file, helpers));
}

describe("explicit $transaction venue context", () => {
  const sites = scanAll(new Set(Object.keys(VENUE_CONTEXT_HELPERS)));

  it("finds the call sites (guards against a scanner that matches nothing)", () => {
    expect(sites.length).toBeGreaterThan(20);
  });

  it("sets venue context first, or is listed in UNSCOPED_TRANSACTIONS", () => {
    const unlisted = [
      ...new Set(
        sites.filter((s) => !s.scoped && !(s.key in UNSCOPED_TRANSACTIONS)).map((s) => s.key)
      ),
    ].sort();
    expect(unlisted).toEqual([]);
  });

  it("has no UNSCOPED_TRANSACTIONS entry for a site that is gone or now scoped", () => {
    const unscopedKeys = new Set(sites.filter((s) => !s.scoped).map((s) => s.key));
    const stale = Object.keys(UNSCOPED_TRANSACTIONS)
      .filter((key) => !unscopedKeys.has(key))
      .sort();
    expect(stale).toEqual([]);
  });

  it("has no VENUE_CONTEXT_HELPERS entry that nothing uses", () => {
    // A helper entry is live only if some callback's first tx use is that call.
    const helpers = Object.keys(VENUE_CONTEXT_HELPERS);
    const without = (name: string): number =>
      scanAll(new Set(helpers.filter((h) => h !== name))).filter((s) => !s.scoped).length;
    const baseline = sites.filter((s) => !s.scoped).length;
    const unused = helpers.filter((name) => without(name) === baseline).sort();
    expect(unused).toEqual([]);
  });
});
