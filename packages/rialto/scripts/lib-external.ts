/**
 * Single source of truth for which import specifiers the library build
 * leaves external (not bundled into dist/lib). Used by:
 *   - vite.config.lib.ts (rollupOptions.external)
 *   - scripts/lib-external.test.ts (static-source regression gate)
 *
 * These are runtime peer dependencies the lib assumes the consumer
 * provides, rather than inlining into the design-system bundle. A
 * component that imports a workspace subpath missing from this list either
 * fails the lib build outright (unresolvable, e.g. #3316) or — the more
 * dangerous case — resolves fine locally and ships un-loadable dist output
 * to registry consumers. See .claude/rules/gotchas.md § Releases.
 */
export const libExternal: (string | RegExp)[] = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "framer-motion",
  "lucide-react",
  // The workspace data client is a runtime peer dependency, not bundled
  // into the design-system lib. Match the bare package and every subpath
  // export (e.g. "@mbe/api-client/streaming") so consumers provide it.
  /^@mbe\/api-client(\/.*)?$/,
];

/** Mirrors Rollup's own external matching: string equality or RegExp test. */
export function isExternalSpecifier(id: string): boolean {
  return libExternal.some((pattern) =>
    typeof pattern === "string" ? pattern === id : pattern.test(id)
  );
}
