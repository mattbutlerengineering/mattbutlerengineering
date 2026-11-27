import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ComponentPageLayout } from "./pages/components/ComponentPageLayout.js";
import { PAGE_REGISTRY } from "./data/page-registry.js";
import { resolveHead } from "./data/route-head-data.js";

const KEYS = [
  ["name", "description"],
  ["property", "og:description"],
  ["name", "twitter:description"],
] as const;

function meta(attribute: string, key: string): string | null {
  return (
    document.head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute("content") ?? null
  );
}

describe("page description", () => {
  afterEach(() => {
    for (const [attribute, key] of KEYS) {
      document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
    }
  });

  it("sets description, og:description and twitter:description per page", () => {
    render(
      <ComponentPageLayout name="A" description="About A.">
        {null}
      </ComponentPageLayout>
    );
    for (const [attribute, key] of KEYS) expect(meta(attribute, key)).toBe("About A.");
  });

  it("differs between two pages and restores the previous value on unmount", () => {
    const shell = document.createElement("meta");
    shell.setAttribute("name", "description");
    shell.setAttribute("content", "shell");
    document.head.appendChild(shell);
    const a = render(
      <ComponentPageLayout name="A" description="About A.">
        {null}
      </ComponentPageLayout>
    );
    a.unmount();
    expect(meta("name", "description")).toBe("shell");
    render(
      <ComponentPageLayout name="B" description="About B.">
        {null}
      </ComponentPageLayout>
    );
    expect(meta("name", "description")).toBe("About B.");
  });
});

describe("unique titles", () => {
  it("gives the command-palette component and example different titles", () => {
    const component = resolveHead("/components/command-palette", PAGE_REGISTRY).title;
    const example = resolveHead("/examples/command-palette", PAGE_REGISTRY).title;
    expect(example).not.toBe(component);
    expect(example).toBe("Command Palette example — Rialto");
  });

  it("has no duplicate title across registry pages", () => {
    const titles = PAGE_REGISTRY.map((entry) => resolveHead(entry.path, PAGE_REGISTRY).title);
    const dupes = titles.filter((title, i) => titles.indexOf(title) !== i);
    expect(dupes).toEqual([]);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("authored descriptions", () => {
  it("no two layout pages declare the same description", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const file of walk(join(__dirname, "pages"))) {
      if (!/Page\.tsx$/.test(file)) continue;
      const match = readFileSync(file, "utf8").match(
        /<(?:Component|Example)PageLayout\b[\s\S]*?\bdescription=(?:"([^"]+)"|\{"([^"]+)"\})/
      );
      const text = match?.[1] ?? match?.[2];
      if (!text) continue;
      const prior = seen.get(text);
      if (prior) dupes.push(`${prior} / ${file}`);
      seen.set(text, file);
    }
    expect(dupes).toEqual([]);
  });
});
