import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The shared service fields know neither form's draft model (availability-hub E4.1): the weekly
 * form's `quick-setup-draft.ts` and the date editor's `draft-changes.ts` import these fields,
 * never the other way round, directly or through anything the fields import.
 */

const HERE = import.meta.dirname;
const AVAILABILITY = resolve(HERE, "..");
const SRC = resolve(HERE, "../../..");
const DRAFT_MODELS = ["quick-setup-draft.ts", "draft-changes.ts"].map((name) =>
  join(AVAILABILITY, name)
);
/** The packages these files may import. Anything else that is not a relative path is refused. */
const PACKAGES = [
  "react",
  "react-i18next",
  "@mattbutlerengineering/rialto",
  "@mbe/availability",
  "@mbe/types",
];

const modules = readdirSync(HERE).filter((name) => /\.tsx?$/.test(name) && !/test/.test(name));

const specifiersOf = (source: string) =>
  [...source.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((match) => match[1] ?? "");

/** A specifier that names a file of this app: a relative path, or the `@/` alias for `src/`. */
const isLocal = (specifier: string) => specifier.startsWith(".") || specifier.startsWith("@/");

/** The source file a local import names: `./x.js` is `x.ts` or `x.tsx`; `@/x.js` is under `src/`. */
function sourceOf(from: string, specifier: string): string | null {
  const target = specifier.startsWith("@/")
    ? resolve(SRC, specifier.slice(2))
    : resolve(dirname(from), specifier);
  const base = target.replace(/\.js$/, "");
  return [`${base}.ts`, `${base}.tsx`, target].find((path) => existsSync(path)) ?? null;
}

function localImports(file: string): string[] {
  if (!/\.tsx?$/.test(file)) return [];
  return specifiersOf(readFileSync(file, "utf8"))
    .filter(isLocal)
    .flatMap((specifier) => {
      const found = sourceOf(file, specifier);
      return found ? [found] : [];
    });
}

/** Every source file reachable from `entry` through local imports. */
function reachable(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const next of localImports(entry)) reachable(next, seen);
  return seen;
}

describe("the service fields import neither draft model", () => {
  it("covers the component and the modules it is built from", () => {
    expect(modules).toEqual(
      expect.arrayContaining([
        "ServiceFields.tsx",
        "ServiceOptions.tsx",
        "TimesRow.tsx",
        "service-options.ts",
        "service-times.ts",
      ])
    );
  });

  it("the draft models exist where this test looks for them", () => {
    expect(DRAFT_MODELS.map((path) => existsSync(path))).toEqual([true, true]);
  });

  it.each(modules)("%s reaches neither draft model", (name) => {
    const reached = [...reachable(join(HERE, name))];
    expect(reached.length).toBeGreaterThan(0);
    expect(
      reached.filter((path) => DRAFT_MODELS.includes(path)).map((path) => relative(HERE, path))
    ).toEqual([]);
  });

  // An import the walk cannot follow (another alias, a workspace package that re-exports a draft)
  // is refused outright, so nothing reaches a draft model by a path this test does not read.
  it.each(modules)("%s imports only local files and the packages it is allowed", (name) => {
    const foreign = specifiersOf(readFileSync(join(HERE, name), "utf8")).filter(
      (specifier) => !isLocal(specifier) && !PACKAGES.includes(specifier)
    );
    expect(foreign).toEqual([]);
  });

  describe("the walk catches what it must", () => {
    const from = join(HERE, "ServiceFields.tsx");

    it("finds a draft model from a file that imports one", () => {
      expect([...reachable(join(AVAILABILITY, "quick-setup-options.ts"))]).toContain(
        DRAFT_MODELS[0]
      );
    });

    it("reads both import forms, and an alias as a local file", () => {
      const source = [
        'import { a } from "@/components/availability/quick-setup-draft.js";',
        'import "./side-effect.js";',
      ].join("\n");
      expect(specifiersOf(source)).toEqual([
        "@/components/availability/quick-setup-draft.js",
        "./side-effect.js",
      ]);
      expect(specifiersOf(source).every(isLocal)).toBe(true);
    });

    it("resolves an `@/` alias import to the draft model it names", () => {
      expect(sourceOf(from, "@/components/availability/quick-setup-draft.js")).toBe(
        DRAFT_MODELS[0]
      );
      expect(sourceOf(from, "@/components/availability/draft-changes.js")).toBe(DRAFT_MODELS[1]);
    });
  });
});
