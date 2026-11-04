import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("mobile overlay layout contract", () => {
  it("keeps the sidebar toggle in its own bar, not fixed over the page", () => {
    const css = readFileSync(resolve(root, "src/layouts/ShowcaseLayout.module.css"), "utf8");
    // A fixed bottom-start control painted over the Card link and the Enabled button.
    expect(css).not.toMatch(/inset-block-end/);
    expect(css).toMatch(/\.mobileNavBar\s*\{[^}]*display:\s*none/);
  });

  it("starts the mobile drawer below the sticky header", () => {
    const css = readFileSync(resolve(root, "src/components/ShowcaseSidebar.module.css"), "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(mobile).toMatch(/padding-block-start:\s*var\(--rialto-space-3xl\)/);
  });
});
