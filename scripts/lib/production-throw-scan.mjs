/**
 * production-throw-scan.mjs — AST-based detector for #4067.
 *
 * Finds `throw new Error(...)` statements that are only reachable when a
 * production-environment guard (`isProduction`, `NODE_ENV === "production"`,
 * etc.) is true, and extracts the env-var-shaped secret name(s) referenced
 * in the thrown message — regardless of how the message is worded.
 *
 * This replaces a regex that matched only the literal phrase
 * "<NAME> is required in production" (#4066), which silently missed any
 * rewording of the same throw (#4064's root cause).
 */

import ts from "typescript";

/** Env vars that gate the production check itself, never the secret being guarded. */
const ENV_DISCRIMINATOR_NAMES = new Set(["NODE_ENV"]);

/** Matches env-var-shaped identifiers, e.g. FOO_TOKEN_SECRET, NODE_ENV. */
const UPPER_SNAKE_RE = /[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+/g;

/** True for `isProduction`-shaped identifiers/property accesses (case-insensitive). */
const IS_PRODUCTION_NAME_RE = /^is_?production$/i;

function isProductionStringLiteral(node) {
  return ts.isStringLiteralLike(node) && node.text === "production";
}

/**
 * True when `node` is a condition expression that gates on "is this
 * production" — either an `isProduction`-named identifier/property, or a
 * `<something> === "production"` comparison.
 *
 * @param {ts.Expression | undefined} node
 * @returns {boolean}
 */
function isProductionGuardExpr(node) {
  if (!node) return false;
  if (ts.isParenthesizedExpression(node)) return isProductionGuardExpr(node.expression);
  if (ts.isIdentifier(node)) return IS_PRODUCTION_NAME_RE.test(node.text);
  if (ts.isPropertyAccessExpression(node)) return IS_PRODUCTION_NAME_RE.test(node.name.text);
  if (ts.isBinaryExpression(node)) {
    const { operatorToken, left, right } = node;
    if (
      operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
    ) {
      return isProductionStringLiteral(left) || isProductionStringLiteral(right);
    }
  }
  return false;
}

/**
 * True when `node` (typically a throw statement) sits under an `if` whose
 * condition is a production guard, at any ancestor depth.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isReachableUnderProductionGuard(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isIfStatement(current) && isProductionGuardExpr(current.expression)) {
      return true;
    }
  }
  return false;
}

/**
 * Resolves `identifierName` to a string-literal value if it's declared
 * (anywhere in the file) as `const/let/var <identifierName> = "<value>"`.
 *
 * @param {ts.SourceFile} sourceFile
 * @param {string} identifierName
 * @returns {string | undefined}
 */
function resolveStringConstant(sourceFile, identifierName) {
  let resolved;
  const visit = (node) => {
    if (resolved) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifierName &&
      node.initializer &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      resolved = node.initializer.text;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return resolved;
}

/**
 * Collects the raw text pieces that make up a thrown Error's message
 * argument: the literal string itself, or every literal span and
 * constant-resolvable `${identifier}` substitution of a template literal.
 *
 * @param {ts.Expression} argNode
 * @param {ts.SourceFile} sourceFile
 * @returns {string[]}
 */
function collectMessageTextPieces(argNode, sourceFile) {
  if (ts.isStringLiteralLike(argNode)) return [argNode.text];
  if (!ts.isTemplateExpression(argNode)) return [];

  const pieces = [argNode.head.text];
  for (const span of argNode.templateSpans) {
    pieces.push(span.literal.text);
    if (ts.isIdentifier(span.expression)) {
      const resolved = resolveStringConstant(sourceFile, span.expression.text);
      if (resolved) pieces.push(resolved);
    }
  }
  return pieces;
}

/**
 * Scans TypeScript `source` for `throw new Error(...)` statements reachable
 * under a production guard, and returns the env-var-shaped secret names
 * referenced in their messages.
 *
 * @param {string} source
 * @param {string} fileName - used only to pick a TS/TSX scanner mode
 * @returns {Set<string>}
 */
export function findProductionThrowSecretNames(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  );
  const names = new Set();

  const visit = (node) => {
    if (
      ts.isThrowStatement(node) &&
      node.expression &&
      ts.isNewExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "Error" &&
      isReachableUnderProductionGuard(node)
    ) {
      const [arg] = node.expression.arguments ?? [];
      if (arg) {
        for (const piece of collectMessageTextPieces(arg, sourceFile)) {
          for (const [token] of piece.matchAll(UPPER_SNAKE_RE)) {
            if (!ENV_DISCRIMINATOR_NAMES.has(token)) names.add(token);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return names;
}
