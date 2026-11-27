#!/usr/bin/env npx tsx
/**
 * Rialto Color CSS Generator (issue #3361)
 *
 * Generates src/tokens/colors.css from the two DTCG authoring sources:
 *   - src/tokens/colors.json       → `:root` (light theme) and a nested
 *     `[data-theme="light"]` island inside `[data-theme="dark"]`
 *   - src/tokens/colors.dark.json  → `[data-theme="dark"]`
 *   - src/tokens/colors.surfaces.json → the `data-surface` scopes (ADR-035):
 *     per scope a light, a dark and a nested-light-island block
 *
 * Custom property names derive deterministically from token paths
 * (see cssVarName in lib/color-tokens.ts); token/group $description
 * fields become the CSS comments.
 *
 * Usage: npx tsx scripts/generate-colors-css.ts
 * Drift-checked by `pnpm regen:check` (rialto-color-tokens family).
 */

import * as fs from "fs";
import * as path from "path";
import {
  assertSurfaceScopeParity,
  assertTokenParity,
  cssVarName,
  isToken,
  SURFACE_SCOPE_THEMES,
  walkTokens,
  type TokenGroup,
} from "./lib/color-tokens.js";

/** Total dash-fill width for `── Title ────` section headers. */
const HEADER_FILL = 43;

/**
 * Descriptions are interpolated into CSS comments; an unescaped comment
 * terminator inside one would end the comment early and ship a
 * syntactically broken stylesheet.
 */
function assertCommentSafe(text: string): string {
  if (text.includes("*/")) {
    throw new Error(
      `Token description contains "*/", which would break the generated CSS: ${text}`
    );
  }
  return text;
}

function sectionHeader(key: string, description: string | undefined): string {
  const title = key.charAt(0).toUpperCase() + key.slice(1);
  const label = description === undefined ? title : `${title} (${assertCommentSafe(description)})`;
  const fill = "─".repeat(Math.max(1, HEADER_FILL - label.length));
  return `  /* ── ${label} ${fill} */`;
}

/** Wrap a long description into `/* … *\/` comment lines of ~64 chars. */
function wrapComment(text: string): string[] {
  const words = assertCommentSafe(text).split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length > 0 && current.length + 1 + word.length > 64) {
      lines.push(current);
      current = word;
    } else {
      current = current.length === 0 ? word : `${current} ${word}`;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.map((line, i) => {
    const open = i === 0 ? "/* " : "   ";
    const close = i === lines.length - 1 ? " */" : "";
    return `${open}${line}${close}`;
  });
}

/** Render one selector block ({selector} { …sections… }) from a token file root. */
function renderBlock(selector: string, fileRoot: TokenGroup, trailer?: string): string {
  const colorGroup = fileRoot["color"];
  if (colorGroup === undefined || typeof colorGroup === "string" || isToken(colorGroup)) {
    throw new Error(`Expected a "color" token group at the file root`);
  }

  // cssVarName can map distinct paths to one name (see its doc) — refuse to
  // emit a block where a later declaration would silently shadow an earlier one.
  const seen = new Set<string>();

  const sections = Object.entries(colorGroup)
    .filter(([key]) => !key.startsWith("$"))
    .map(([key, node]) => {
      if (node === undefined || typeof node === "string") {
        throw new Error(`Unexpected non-token entry "color.${key}"`);
      }
      const groupDescription =
        !isToken(node) && typeof node.$description === "string" ? node.$description : undefined;
      const lines = [sectionHeader(key, groupDescription)];
      const entries = isToken(node)
        ? [{ path: ["color", key], token: node }]
        : walkTokens(node, ["color", key]);
      for (const { path: tokenPath, token } of entries) {
        const varName = cssVarName(tokenPath);
        if (seen.has(varName)) {
          throw new Error(
            `Duplicate CSS variable ${varName} (from token path ${tokenPath.join(".")})`
          );
        }
        seen.add(varName);
        if (token.$description !== undefined) {
          lines.push(`  /* ${assertCommentSafe(token.$description)} */`);
        }
        lines.push(`  ${varName}: ${token.$value};`);
      }
      return lines.join("\n");
    });

  const body = sections.join("\n\n") + (trailer === undefined ? "" : `\n\n  ${trailer}`);
  return `${selector} {\n${body}\n}`;
}

/** A scope key names the custom property it re-declares: `border` → `--rialto-border`. */
function renderScopeBlock(selector: string, group: TokenGroup): string {
  const lines = walkTokens(group).map(({ path: keyPath, token }) => {
    const comment =
      token.$description === undefined ? [] : [`  /* ${assertCommentSafe(token.$description)} */`];
    return [...comment, `  --rialto-${keyPath.join("-")}: ${token.$value};`].join("\n");
  });
  return `${selector} {\n${lines.join("\n")}\n}`;
}

const SCOPE_SELECTORS: Record<(typeof SURFACE_SCOPE_THEMES)[number], (scope: string) => string[]> =
  {
    light: (scope) => [
      `[data-surface="${scope}"]`,
      `[data-theme="dark"] [data-theme="light"] [data-surface="${scope}"]`,
    ],
    dark: (scope) => [`[data-theme="dark"] [data-surface="${scope}"]`],
  };

/** Every scope's blocks: light, dark, then light inside a nested light island. */
function renderSurfaceScopes(file: TokenGroup): string[] {
  assertSurfaceScopeParity(file);
  const scopes = file["surface-scope"] as TokenGroup;
  return Object.entries(scopes)
    .filter(([scope]) => !scope.startsWith("$"))
    .flatMap(([scope, themes]) => {
      const byTheme = themes as TokenGroup;
      const [light, nestedLight] = SCOPE_SELECTORS.light(scope);
      const [dark] = SCOPE_SELECTORS.dark(scope);
      const darkGroup = byTheme["dark"] as TokenGroup;
      // An empty dark group keeps the dark theme's values: no dark block.
      const darkBlock =
        walkTokens(darkGroup).length === 0 ? [] : [renderScopeBlock(dark as string, darkGroup), ""];
      return [
        renderScopeBlock(light as string, byTheme["light"] as TokenGroup),
        "",
        ...darkBlock,
        renderScopeBlock(nestedLight as string, byTheme["light"] as TokenGroup),
        "",
      ];
    });
}

function main(): void {
  const tokensDir = path.join(process.cwd(), "src/tokens");
  const light = JSON.parse(
    fs.readFileSync(path.join(tokensDir, "colors.json"), "utf-8")
  ) as TokenGroup;
  const dark = JSON.parse(
    fs.readFileSync(path.join(tokensDir, "colors.dark.json"), "utf-8")
  ) as TokenGroup;

  const surfaces = JSON.parse(
    fs.readFileSync(path.join(tokensDir, "colors.surfaces.json"), "utf-8")
  ) as TokenGroup;

  assertTokenParity(light, dark);

  const darkColor = dark["color"];
  const darkPreamble =
    darkColor !== undefined && typeof darkColor !== "string" && !isToken(darkColor)
      ? darkColor.$description
      : undefined;

  const parts = [
    "/*",
    " * GENERATED FILE — DO NOT EDIT.",
    " * Authoring sources: src/tokens/colors.json (light), src/tokens/colors.dark.json (dark),",
    " * src/tokens/colors.surfaces.json (data-surface scopes).",
    " * Regenerate: pnpm --filter @mattbutlerengineering/rialto generate:tokens",
    " * Drift-checked by `pnpm regen:check` (rialto-color-tokens family).",
    " */",
    "",
    renderBlock(":root", light),
    "",
    "/* ── Dark Theme ──────────────────────────────── */",
    ...(typeof darkPreamble === "string" ? wrapComment(darkPreamble) : []),
    renderBlock('[data-theme="dark"]', dark, "color-scheme: dark;"),
    "",
    "/* ── Nested light scope ──────────────────────── */",
    ...wrapComment(
      "Custom properties inherit, and :root does not match an element. A light island inside a dark ancestor would otherwise keep the dark palette. Re-declare the light tokens on that island. This rule follows the dark block so a parser that takes the first dark-attribute rule still reads the dark palette."
    ),
    renderBlock('[data-theme="dark"] [data-theme="light"]', light, "color-scheme: light;"),
    "",
    "/* ── Surface scopes ────────────────────────────── */",
    ...wrapComment(
      "Mid-tone bands (ADR-035). Content on a data-surface element reads these re-declared tokens. The element does not paint its own background: the consumer sets background: var(--rialto-surface-tinted) or -velvet. These rules follow the theme blocks so a scope beats the theme it sits in."
    ),
    ...renderSurfaceScopes(surfaces),
  ];

  const outPath = path.join(tokensDir, "colors.css");
  fs.writeFileSync(outPath, parts.join("\n"));

  const tokenCount = walkTokens(light).length;
  console.info(
    `Generated ${path.relative(process.cwd(), outPath)}: ${tokenCount} tokens, dark override, nested light scope and surface scopes`
  );
}

main();
