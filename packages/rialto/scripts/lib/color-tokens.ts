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
