#!/usr/bin/env npx tsx
/**
 * Rialto Color CSS Generator (issue #3361)
 *
 * Generates src/tokens/colors.css from the two DTCG authoring sources:
 *   - src/tokens/colors.json       → `:root` (light theme)
 *   - src/tokens/colors.dark.json  → `[data-theme="dark"]`
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
  assertTokenParity,
  cssVarName,
  isToken,
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

function main(): void {
  const tokensDir = path.join(process.cwd(), "src/tokens");
  const light = JSON.parse(
    fs.readFileSync(path.join(tokensDir, "colors.json"), "utf-8")
  ) as TokenGroup;
  const dark = JSON.parse(
    fs.readFileSync(path.join(tokensDir, "colors.dark.json"), "utf-8")
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
    " * Authoring sources: src/tokens/colors.json (light), src/tokens/colors.dark.json (dark).",
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
  ];

  const outPath = path.join(tokensDir, "colors.css");
  fs.writeFileSync(outPath, parts.join("\n"));

  const tokenCount = walkTokens(light).length;
  console.info(
    `Generated ${path.relative(process.cwd(), outPath)}: ${tokenCount} tokens × 2 themes`
  );
}

main();
