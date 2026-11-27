import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_REGISTRY, REGISTRY_SITEMAP_PATHS } from "./page-registry.js";
import {
  HOME_CANONICAL,
  HOME_SOCIAL_TITLE,
  HOME_TITLE,
  DEMOS_TITLE,
  canonicalUrl,
  prerenderHeads,
  resolveHead,
  routeHtmlFileName,
} from "./route-head-data.js";

/** Mirrors the explicit `load` overrides in page-registry.ts. */
const MODULE_BY_ID: Record<string, string> = {
  "example-guest-profile": "GuestDetailExamplePage",
  "example-error-403": "ErrorForbiddenExamplePage",
  "example-error-404": "ErrorNotFoundExamplePage",
  "example-error-500": "ErrorServerExamplePage",
  "example-command-palette": "CommandPaletteExamplePage",
};

function toPascalCase(label: string): string {
  return label
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const PAGE_FILES = walk(join(__dirname, "../pages"));

function layoutName(source: string): string | undefined {
  return source.match(/<(?:Component|Example)PageLayout\b[\s\S]*?\bname="([^"]+)"/)?.[1];
}

describe("resolveHead", () => {
  it("keeps the home title and the distinct social title on /", () => {
    const head = resolveHead("/", PAGE_REGISTRY);
    expect(head.title).toBe(HOME_TITLE);
    expect(head.title).toBe("Rialto — Design System");
    expect(head.socialTitle).toBe(HOME_SOCIAL_TITLE);
    expect(head.socialTitle).not.toBe(head.title);
    expect(head.url).toBe(HOME_CANONICAL);
  });

  it("points a component and an example at their own url and heading", () => {
    expect(resolveHead("/components/accordion", PAGE_REGISTRY)).toEqual({
      title: "Accordion — Rialto",
      socialTitle: "Accordion — Rialto",
      url: "https://mattbutlerengineering.com/rialto/components/accordion",
    });
    expect(resolveHead("/examples/invoice/", PAGE_REGISTRY).title).toBe("Invoice — Rialto");
    expect(resolveHead("/examples/checkout", PAGE_REGISTRY).url).toBe(
      "https://mattbutlerengineering.com/rialto/examples/checkout"
    );
    expect(resolveHead("/examples/dashboard", PAGE_REGISTRY).title).toBe("Dashboard — Rialto");
  });

  it("uses the layout heading when it differs from the sidebar label", () => {
    expect(resolveHead("/examples/reservations", PAGE_REGISTRY).title).toBe(
      "Reservations — Rialto"
    );
    expect(resolveHead("/components/disabled-tooltip", PAGE_REGISTRY).title).toBe(
      "DisabledTooltip — Rialto"
    );
    expect(resolveHead("/components/checkbox-radio", PAGE_REGISTRY).title).toBe(
      "Checkbox & Radio — Rialto"
    );
  });

  it("titles demos, including subpages, and keeps the demos index trailing slash", () => {
    expect(resolveHead("/demos", PAGE_REGISTRY).url).toBe(
      "https://mattbutlerengineering.com/rialto/demos/"
    );
    expect(resolveHead("/demos/", PAGE_REGISTRY).title).toBe("Demos — Rialto");
    expect(resolveHead("/demos/login", PAGE_REGISTRY)).toMatchObject({
      title: "Sign In — Rialto",
      url: "https://mattbutlerengineering.com/rialto/demos/login",
    });
    expect(resolveHead("/demos/dashboard", PAGE_REGISTRY).title).toBe("Pit Wall — Rialto");
    expect(resolveHead("/demos/drivers/42", PAGE_REGISTRY).title).toBe("Driver — Rialto");
    expect(resolveHead("/demos/drivers/42/edit", PAGE_REGISTRY)).toMatchObject({
      title: "Edit Driver — Rialto",
      url: "https://mattbutlerengineering.com/rialto/demos/drivers/42/edit",
    });
    expect(resolveHead("/privacy", PAGE_REGISTRY).title).toBe("Privacy Policy — Rialto");
  });

  it("gives an unknown path the not-found title and the home canonical", () => {
    const head = resolveHead("/no-such-page", PAGE_REGISTRY);
    expect(head.url).toBe(HOME_CANONICAL);
    expect(head.title).toBe("Page not found — Rialto");
  });

  it("builds canonical urls without a trailing slash except home and the demos index", () => {
    expect(canonicalUrl("/components/button")).toBe(
      "https://mattbutlerengineering.com/rialto/components/button"
    );
    expect(canonicalUrl("/")).toBe(HOME_CANONICAL);
    expect(canonicalUrl("/demos")).toBe("https://mattbutlerengineering.com/rialto/demos/");
  });
});

describe("demos social title and visual-test robots", () => {
  it("hydrated /demos social title equals the static one", () => {
    expect(resolveHead("/demos", []).socialTitle).toBe(DEMOS_TITLE);
  });

  it("emits noindex for both visual-test routes and nothing else", () => {
    const heads = prerenderHeads([]);
    const noindex = heads.filter((h) => h.robots === "noindex").map((h) => h.fileName);
    expect(noindex.sort()).toEqual(["demos/visual-test.html", "visual-test.html"]);
  });
});

describe("prerender file names", () => {
  const heads = prerenderHeads(PAGE_REGISTRY);
  const files = new Set(heads.map((head) => head.fileName));

  it("covers every sitemap path and the static demo routes", () => {
    const missing = REGISTRY_SITEMAP_PATHS.filter((path) => !files.has(routeHtmlFileName(path)));
    expect(missing).toEqual([]);
    expect(files.has("components/accordion.html")).toBe(true);
    expect(files.has("examples/invoice.html")).toBe(true);
    expect(files.has("demos/login.html")).toBe(true);
    expect(files.has("privacy.html")).toBe(true);
  });

  it("does not emit index.html or demos/index.html (those stay special)", () => {
    expect(files.has("index.html")).toBe(false);
    expect(files.has("demos/index.html")).toBe(false);
    expect(files.has("demos.html")).toBe(false);
    expect(new Set(heads.map((head) => head.fileName)).size).toBe(heads.length);
  });
});

describe("document title stems match layout headings", () => {
  it("every registry page's title stem is the name= on its layout", () => {
    const mismatches: string[] = [];
    for (const entry of PAGE_REGISTRY) {
      const moduleBase =
        MODULE_BY_ID[entry.id] ??
        `${toPascalCase(entry.label)}${entry.category === "Examples" ? "ExamplePage" : "Page"}`;
      const file = PAGE_FILES.find((candidate) => candidate.endsWith(`/${moduleBase}.tsx`));
      if (!file) {
        mismatches.push(`${entry.id}: no module ${moduleBase}.tsx`);
        continue;
      }
      const name = layoutName(readFileSync(file, "utf8"));
      const stem = entry.heading ?? entry.label;
      if (name !== stem) mismatches.push(`${entry.id}: layout "${name}" vs stem "${stem}"`);
    }
    expect(mismatches).toEqual([]);
  });
});
