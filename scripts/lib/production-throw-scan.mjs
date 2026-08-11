/**
 * production-throw-scan.mjs — AST-based detector for #4067 (reworked).
 *
 * Finds `throw new Error(...)` statements that are only reachable when a
 * production-environment guard (`isProduction`, `NODE_ENV === "production"`,
 * `isProduction()`, `NODE_ENV !== "development"`, an early-return guard
 * clause, etc.) is true — or that are fully unconditional (strictly more
 * dangerous, since they fire in every environment including production) —
 * and resolves the env-var-shaped secret name(s) they guard by walking the
 * AST from the throw outward to a `process.env.<NAME>` read, regardless of
 * how the thrown message is worded.
 *
 * The original version (#4066) extracted the secret name by scraping
 * UPPER_SNAKE_CASE tokens out of the thrown message string. That moved the
 * textual coupling this detector exists to remove from the whole sentence
 * down to a single token — a rewording that drops the name from the message
 * (while still reading `process.env.<NAME>`) silently returned nothing.
 * Message-token extraction is now kept only as an *additional* signal, not
 * the sole mechanism — it is what still lets a fully unconditional throw
 * with no `process.env` reference at all resolve a name.
 *
 * Invariant change: unlike the original regex (which matched the phrase
 * anywhere in a file, guarded or not), a throw gated behind a condition that
 * is NOT a recognized production guard (e.g. an unrelated feature flag) is
 * no longer treated as production-gated — only genuinely production-guarded
 * or fully unconditional throws are.
 */

import ts from "typescript";

/** Env vars that gate the production check itself, never the secret being guarded. */
const ENV_DISCRIMINATOR_NAMES = new Set(["NODE_ENV"]);

/** Matches env-var-shaped identifiers, e.g. FOO_TOKEN_SECRET, NODE_ENV. */
const UPPER_SNAKE_RE = /[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+/g;

/** True for `isProduction`-shaped identifiers/property accesses (case-insensitive). */
const IS_PRODUCTION_NAME_RE = /^is_?production$/i;

const FUNCTION_LIKE_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.Constructor,
]);

function isFunctionLikeNode(node) {
  return !!node && FUNCTION_LIKE_KINDS.has(node.kind);
}

function isProductionStringLiteral(node) {
  return ts.isStringLiteralLike(node) && node.text === "production";
}

/**
 * True when `node` is a condition expression that gates on "is this
 * production" — an `isProduction`-named identifier/property/call, a
 * `<something> === "production"` comparison, or a `<something> !== <a
 * non-production string literal>` comparison (e.g. `NODE_ENV !== "development"`).
 *
 * @param {ts.Expression | undefined} node
 * @returns {boolean}
 */
function isProductionGuardExpr(node) {
  if (!node) return false;
  if (ts.isParenthesizedExpression(node)) return isProductionGuardExpr(node.expression);
  if (ts.isIdentifier(node)) return IS_PRODUCTION_NAME_RE.test(node.text);
  if (ts.isPropertyAccessExpression(node)) return IS_PRODUCTION_NAME_RE.test(node.name.text);
  if (ts.isCallExpression(node)) return isProductionGuardExpr(node.expression);
  if (ts.isBinaryExpression(node)) {
    const { operatorToken, left, right } = node;
    if (
      operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
    ) {
      return isProductionStringLiteral(left) || isProductionStringLiteral(right);
    }
    if (
      operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      const literal = ts.isStringLiteralLike(left)
        ? left
        : ts.isStringLiteralLike(right)
          ? right
          : undefined;
      return !!literal && literal.text !== "production";
    }
  }
  return false;
}

/**
 * True when `node` is the logical negation of a production guard, e.g.
 * `!isProduction` — the shape used by early-return guard clauses
 * (`if (!isProduction) return;`).
 *
 * @param {ts.Expression | undefined} node
 * @returns {boolean}
 */
function isNegatedProductionGuardExpr(node) {
  if (!node) return false;
  if (ts.isParenthesizedExpression(node)) return isNegatedProductionGuardExpr(node.expression);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
    return isProductionGuardExpr(node.operand);
  }
  return false;
}

/**
 * True when `stmt` is an early-return guard clause of the form
 * `if (!isProduction) return;` (single return, no else branch) — code after
 * it in the same block only runs when in production.
 *
 * @param {ts.Statement} stmt
 * @returns {boolean}
 */
function isEarlyReturnGuardClause(stmt) {
  if (!ts.isIfStatement(stmt) || stmt.elseStatement) return false;
  if (!isNegatedProductionGuardExpr(stmt.expression)) return false;
  const then = stmt.thenStatement;
  if (ts.isReturnStatement(then)) return true;
  return ts.isBlock(then) && then.statements.some(ts.isReturnStatement);
}

/**
 * True when `node` sits under an `if` whose condition is a production
 * guard, at any ancestor depth.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isUnderAncestorProductionGuard(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isIfStatement(current) && isProductionGuardExpr(current.expression)) {
      return true;
    }
  }
  return false;
}

/**
 * True when an earlier sibling statement in `node`'s enclosing block (within
 * the same function) is an early-return production guard clause. Stops at
 * the nearest function boundary — control flow doesn't cross function
 * scopes.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isUnderEarlyReturnGuard(node) {
  let current = node;
  let parent = current.parent;
  while (parent) {
    if ((ts.isBlock(parent) || ts.isSourceFile(parent)) && Array.isArray(parent.statements)) {
      const idx = parent.statements.indexOf(current);
      if (idx > 0) {
        for (let i = 0; i < idx; i++) {
          if (isEarlyReturnGuardClause(parent.statements[i])) return true;
        }
      }
      if (isFunctionLikeNode(parent.parent)) return false;
    }
    current = parent;
    parent = current.parent;
  }
  return false;
}

/**
 * True when `node` (typically a throw statement) is reachable under a
 * production guard, or has no enclosing `if` at all — a fully unconditional
 * throw is strictly more dangerous than a guarded one (it fires in every
 * environment, including production), so it is treated as reachable too.
 *
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isReachableUnderProductionGuard(node) {
  if (isUnderAncestorProductionGuard(node)) return true;
  if (isUnderEarlyReturnGuard(node)) return true;
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isIfStatement(current)) return false; // gated by a non-production condition
  }
  return true; // fully unconditional
}

function isProcessEnvExpr(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  );
}

/**
 * Returns `NAME` when `node` is `process.env.NAME` or `process.env["NAME"]`.
 *
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function envNameFromAccess(node) {
  if (ts.isPropertyAccessExpression(node) && isProcessEnvExpr(node.expression)) {
    return node.name.text;
  }
  if (
    ts.isElementAccessExpression(node) &&
    isProcessEnvExpr(node.expression) &&
    node.argumentExpression &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return node.argumentExpression.text;
  }
  return undefined;
}

/** Unwraps `(expr)` and `expr ?? fallback` / `expr || fallback` to `expr`. */
function unwrapFallback(node) {
  if (ts.isParenthesizedExpression(node)) return unwrapFallback(node.expression);
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return unwrapFallback(node.left);
  }
  return node;
}

/**
 * Resolves `identifierName` to an env var name if it's declared (anywhere in
 * `scope`) as `const/let/var <identifierName> = process.env.<NAME>`
 * (optionally with a `?? fallback` / `|| fallback`).
 *
 * @param {ts.Node} scope
 * @param {string} identifierName
 * @returns {string | undefined}
 */
function resolveEnvNameForIdentifier(scope, identifierName) {
  let resolved;
  const visit = (node) => {
    if (resolved) return;
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifierName &&
      node.initializer
    ) {
      const name = envNameFromAccess(unwrapFallback(node.initializer));
      if (name) {
        resolved = name;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return resolved;
}

/**
 * The nearest enclosing function-like node containing `node`, or the whole
 * `sourceFile` when there is none (a module-level throw).
 *
 * @param {ts.Node} node
 * @param {ts.SourceFile} sourceFile
 * @returns {ts.Node}
 */
function enclosingScope(node, sourceFile) {
  for (let current = node.parent; current; current = current.parent) {
    if (isFunctionLikeNode(current)) return current;
  }
  return sourceFile;
}

/**
 * Collects env-var names referenced (directly or via a scope-local variable
 * declaration) within `condition`.
 *
 * @param {ts.Expression} condition
 * @param {ts.Node} scope
 * @returns {Set<string>}
 */
function collectEnvNamesFromCondition(condition, scope) {
  const names = new Set();
  const visit = (node) => {
    const direct = envNameFromAccess(node);
    if (direct) {
      names.add(direct);
      return;
    }
    if (ts.isIdentifier(node)) {
      const resolved = resolveEnvNameForIdentifier(scope, node.text);
      if (resolved) names.add(resolved);
    }
    ts.forEachChild(node, visit);
  };
  visit(condition);
  return names;
}

/**
 * Structurally resolves the secret name(s) a throw statement guards, by
 * walking every ancestor `if` condition between `throwNode` and its
 * enclosing scope and resolving referenced identifiers back to a
 * `process.env.<NAME>` read.
 *
 * @param {ts.ThrowStatement} throwNode
 * @param {ts.SourceFile} sourceFile
 * @returns {Set<string>}
 */
function resolveStructuralSecretNames(throwNode, sourceFile) {
  const scope = enclosingScope(throwNode, sourceFile);
  const names = new Set();
  for (let current = throwNode.parent; current; current = current.parent) {
    if (current === scope) break;
    if (ts.isIfStatement(current)) {
      for (const name of collectEnvNamesFromCondition(current.expression, scope)) {
        if (!ENV_DISCRIMINATOR_NAMES.has(name)) names.add(name);
      }
    }
  }
  return names;
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
 * Message-token extraction: an *additional* signal on top of structural
 * resolution, not the sole mechanism. Kept mainly so a fully unconditional
 * throw with no `process.env` reference at all can still resolve a name.
 *
 * @param {ts.Expression} argNode
 * @param {ts.SourceFile} sourceFile
 * @returns {Set<string>}
 */
function resolveMessageTokenNames(argNode, sourceFile) {
  const names = new Set();
  for (const piece of collectMessageTextPieces(argNode, sourceFile)) {
    for (const [token] of piece.matchAll(UPPER_SNAKE_RE)) {
      if (!ENV_DISCRIMINATOR_NAMES.has(token)) names.add(token);
    }
  }
  return names;
}

/**
 * Scans TypeScript `source` for `throw new Error(...)` statements reachable
 * under a production guard (or fully unconditional), and returns the
 * env-var-shaped secret names they guard.
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
  if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0) {
    const messages = sourceFile.parseDiagnostics
      .map((d) => (typeof d.messageText === "string" ? d.messageText : d.messageText.messageText))
      .join("; ");
    throw new Error(`production-throw-scan: failed to parse ${fileName}: ${messages}`);
  }

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
        for (const name of resolveStructuralSecretNames(node, sourceFile)) {
          names.add(name);
        }
        for (const name of resolveMessageTokenNames(arg, sourceFile)) {
          names.add(name);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return names;
}
