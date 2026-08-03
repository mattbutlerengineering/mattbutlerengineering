// Hand-written type declarations for the subset of merge-train-lock.mjs's
// public API consumed from TypeScript packages (currently just
// packages/agent-core/src/file-classifier.ts). scripts/ is plain JS with no
// tsconfig of its own, so this sibling .d.mts is what lets a strict TS
// package import it directly instead of re-declaring the same predicate.
// Keep in sync with the JSDoc in merge-train-lock.mjs.

/**
 * True when `filePath` is under the frontend tree (`apps/**` or
 * `packages/rialto/**`).
 */
export function isFrontendPath(filePath: string): boolean;
