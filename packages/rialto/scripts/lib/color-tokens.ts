/**
 * Shared helpers for the color-token generators (issue #3361).
 *
 * The authoring sources are src/tokens/colors.json (light) and
 * src/tokens/colors.dark.json (dark) — two DTCG files with identical token
 * paths. Everything else (colors.css, the color sets in figma-tokens.json)
 * is generated from them:
 *
 *   colors.json ─┬─ generate-colors-css.ts   → src/tokens/colors.css
 *   colors.dark.json ─┴─ generate-figma-tokens.ts → figma-tokens.json
 *
 * Drift is caught by the `rialto-color-tokens` regen family
 * (`pnpm regen:check`).
 */

export interface DtcgToken {
  readonly $value: string | number;
  readonly $type: string;
  readonly $description?: string;
}

export interface TokenGroup {
  readonly [key: string]: DtcgToken | TokenGroup | string | undefined;
}

/** True when a node is a DTCG leaf token (has a $value). */
export function isToken(node: DtcgToken | TokenGroup | string | undefined): node is DtcgToken {
  return typeof node === "object" && node !== null && "$value" in node;
}

export interface TokenEntry {
  /** Path segments below the file root, e.g. ["color", "semantic", "error", "muted"]. */
  readonly path: readonly string[];
  readonly token: DtcgToken;
}

/**
 * Depth-first walk of every leaf token, `$`-keys skipped. Order follows JS
 * object key order — authoring order for the current string keys, but
 * integer-like keys (e.g. a future "100" scale step) would sort first.
 */
export function walkTokens(group: TokenGroup, prefix: readonly string[] = []): TokenEntry[] {
  return Object.entries(group)
    .filter(([key]) => !key.startsWith("$"))
    .flatMap(([key, node]) => {
      if (node === undefined || typeof node === "string") return [];
      const path = [...prefix, key];
      return isToken(node) ? [{ path, token: node }] : walkTokens(node, path);
    });
}

/**
 * Deterministic DTCG-path → CSS custom property mapping. Rules (mirrors the
 * historical hand-authored names in colors.css):
 *   - the leading "color" segment and the level-1 "semantic" grouping segment
 *     are organizational only — dropped;
 *   - a trailing "default" leaf names the group itself — dropped;
 *   - remaining segments join with "-" under the --rialto- prefix.
 * e.g. color.semantic.error.muted → --rialto-error-muted,
 *      color.surface.default → --rialto-surface.
 *
 * Distinct paths CAN collide (color.semantic.error.default vs a future
 * color.error.default) — generators must assert emitted names are unique.
 */
export function cssVarName(path: readonly string[]): string {
  const segments = path.filter(
    (seg, i) => !(i === 0 && seg === "color") && !(i === 1 && seg === "semantic")
  );
  const trimmed = segments.at(-1) === "default" ? segments.slice(0, -1) : segments;
  if (trimmed.length === 0) {
    throw new Error(`Token path [${path.join(".")}] reduces to an empty CSS variable name`);
  }
  return `--rialto-${trimmed.join("-")}`;
}

/**
 * Fail loudly when the two theme files declare different token paths — a
 * missing dark value would otherwise silently fall back to the light value
 * in generated output.
 */
export function assertTokenParity(light: TokenGroup, dark: TokenGroup): void {
  const lightPaths = new Set(walkTokens(light).map((entry) => entry.path.join(".")));
  const darkPaths = new Set(walkTokens(dark).map((entry) => entry.path.join(".")));
  const missing = [...lightPaths].filter((p) => !darkPaths.has(p));
  const extra = [...darkPaths].filter((p) => !lightPaths.has(p));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `colors.json and colors.dark.json token paths diverge.` +
        (missing.length > 0 ? ` Missing in dark: ${missing.join(", ")}.` : "") +
        (extra.length > 0 ? ` Extra in dark: ${extra.join(", ")}.` : "")
    );
  }
}

/**
 * Keys a scope may declare without the others following. `error` re-declares
 * --rialto-error where the base red fails contrast (velvet).
 */
const OPTIONAL_SCOPE_KEYS: ReadonlySet<string> = new Set(["error"]);

/** Themes every surface scope declares, in emission order. */
export const SURFACE_SCOPE_THEMES = ["light", "dark"] as const;

/**
 * The `surface-scope` group of colors.surfaces.json (ADR-035), checked: one
 * entry per scope, each with a light and a dark token group. Throws when a
 * scope lacks a theme, when a scope's light and dark keys differ, or when two
 * scopes declare different keys (beyond OPTIONAL_SCOPE_KEYS) — any of which
 * would leave a band reading its parent's value for one token in one theme.
 * An empty dark group is allowed: the scope keeps the dark theme's values.
 */
export function assertSurfaceScopeParity(file: TokenGroup): void {
  const scopes = file["surface-scope"];
  if (scopes === undefined || typeof scopes === "string" || isToken(scopes)) {
    throw new Error(`colors.surfaces.json has no "surface-scope" group`);
  }
  let reference: { scope: string; keys: string } | undefined;
  for (const [scope, themes] of Object.entries(scopes)) {
    if (scope.startsWith("$")) continue;
    if (themes === undefined || typeof themes === "string" || isToken(themes)) {
      throw new Error(`Surface scope "${scope}" is not a group of themes`);
    }
    const [lightKeys, darkKeys] = SURFACE_SCOPE_THEMES.map((theme) => {
      const group = themes[theme];
      if (group === undefined || typeof group === "string" || isToken(group)) {
        throw new Error(`Surface scope "${scope}" has no "${theme}" group`);
      }
      return new Set(walkTokens(group).map((entry) => entry.path.join(".")));
    }) as [Set<string>, Set<string>];
    const missing = darkKeys.size === 0 ? [] : [...lightKeys].filter((key) => !darkKeys.has(key));
    const extra = [...darkKeys].filter((key) => !lightKeys.has(key));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `Surface scope "${scope}" light and dark keys diverge.` +
          (missing.length > 0 ? ` Missing in dark: ${missing.join(", ")}.` : "") +
          (extra.length > 0 ? ` Extra in dark: ${extra.join(", ")}.` : "")
      );
    }
    const keys = [...lightKeys]
      .filter((key) => !OPTIONAL_SCOPE_KEYS.has(key))
      .sort()
      .join(",");
    if (reference === undefined) {
      reference = { scope, keys };
    } else if (reference.keys !== keys) {
      throw new Error(
        `Surface scope "${scope}" declares different keys from "${reference.scope}": ${keys} vs ${reference.keys}`
      );
    }
  }
}
