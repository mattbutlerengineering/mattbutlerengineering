/**
 * Toasts compose `.glass`, and accent/success/error then set a translucent
 * muted fill. In dark mode the glass rule wins the cascade, so the page shows
 * through. `layout` + `popLayout` also takes the stack out of flow, so five
 * quick toasts overlap and the last one keeps a stuck offset.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Toast dark surface and stack", () => {
  const css = readFileSync(path.join(__dirname, "Toast.module.css"), "utf8");
  const animated = readFileSync(path.join(__dirname, "ToastAnimated.tsx"), "utf8");

  it("paints an opaque elevated surface over the dark glass recipe", () => {
    const base = /:global\(\[data-theme="dark"\]\) \.toast\.toast\s*\{([^}]+)\}/.exec(css);
    expect(base?.[1]).toMatch(/background-color:\s*var\(--rialto-surface-elevated\)/);
    expect(base?.[1]).toMatch(/backdrop-filter:\s*none/);
    expect(base?.[1]).toMatch(/-webkit-backdrop-filter:\s*none/);
    for (const variant of ["success", "error", "accent"]) {
      const rule = new RegExp(
        `:global\\(\\[data-theme="dark"\\]\\) \\.toast\\.${variant}\\s*\\{([^}]+)\\}`
      ).exec(css);
      expect(rule?.[1], variant).toMatch(/background-color:\s*var\(--rialto-surface-elevated\)/);
      expect(rule?.[1], variant).toMatch(/background-image:\s*linear-gradient/);
      expect(rule?.[1], variant).toMatch(/backdrop-filter:\s*none/);
    }
  });

  it("stacks toasts in normal flow with an even gap", () => {
    const stack = /\.stack\s*\{([^}]+)\}/.exec(css)?.[1] ?? "";
    expect(stack).toMatch(/display:\s*flex/);
    expect(stack).toMatch(/flex-direction:\s*column/);
    expect(stack).toMatch(/gap:\s*var\(--rialto-space-xs\)/);
    expect(animated).not.toMatch(/mode="popLayout"/);
    expect(animated).not.toMatch(/^\s+layout\s*$/m);
  });
});
