import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The rehearsal is a view of a simulated night: it must not be able to write. This guard reads
 * every non-test source file under `components/rehearsal/` and `pages/RehearsalPage.tsx` and fails
 * on any import outside an explicit allowlist, and on any token that names a network or API
 * client. An allowlist, not a blocklist, because the property wanted is "can only read": a
 * blocklist of write hooks silently permits the next one added.
 *
 * The Playwright route spy (e2e/dress-rehearsal.spec.ts) is the dynamic backstop for a write
 * reached through a shared component's own hook, which no static check can see.
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REHEARSAL_DIR = "components/rehearsal";
const REHEARSAL_PAGE = "pages/RehearsalPage.tsx";

/** Bare package specifiers (or subpath prefixes) that cannot write. */
const PACKAGE_ALLOWLIST: readonly string[] = [
  "react",
  "react-dom",
  "react-router",
  "react-i18next",
  "i18next",
  "zod",
  "@mattbutlerengineering/rialto",
  "@mattbutlerengineering/rialto/providers",
  "@mbe/types",
  "@mbe/sentry/react",
];

/** App modules (src-relative, extension stripped) that are read-only or pure. */
const MODULE_ALLOWLIST: readonly string[] = [
  "components/timeline/TimelineGrid",
  "components/timeline/TimelineEmptyNight",
  "components/timeline/TimelineSkeleton",
  "components/floor-plan/FloorPlanCanvas",
  "components/ErrorRetryBanner",
  "contexts/VenueContext",
  "hooks/useVenueFormat",
  "hooks/useNow",
  "hooks/useDocumentTitle",
  "hooks/use-url-params",
  "utils/service-day",
  "utils/format",
  "lib/describe-api-error",
];

/**
 * Modules that mix reads with writes: only these named imports are allowed. A module-level
 * allowlist would be a hole, because `hooks/useFloorPlans` also exports `useCloneFloorPlan`,
 * `useAddTable` and the other mutation hooks.
 */
const NAMED_ONLY: Readonly<Record<string, readonly string[]>> = {
  "hooks/useTables": ["useTables"],
  "hooks/useFloorPlans": ["useFloorPlans", "useFloorPlan"],
};

/**
 * Tokens that name a way to reach the network or the API client. `fetch` carries a lookbehind so
 * `refetch(` (a read hook's retry) does not trip it, while `window.fetch(` still does.
 */
const FORBIDDEN_TOKENS: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = [
  { label: "@mbe/api-client", pattern: /@mbe\/api-client/ },
  { label: "useApiClient", pattern: /\buseApiClient\b/ },
  { label: "usePublicApiClient", pattern: /\busePublicApiClient\b/ },
  { label: "createMutationHook", pattern: /\bcreateMutationHook\b/ },
  { label: "fetch(", pattern: /(?<![A-Za-z0-9_$])fetch\s*\(/ },
  { label: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
  { label: "sendBeacon", pattern: /\bsendBeacon\b/ },
];

const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

const STATIC_IMPORT = /\bimport\s+(?:type\s+)?([^"';]*?)\s*from\s*["']([^"']+)["']/g;
const SIDE_EFFECT_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const EXPORT_FROM =
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})(?:\s+as\s+\w+)?\s*from\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*([^)]*?)\s*\)/g;
const REQUIRE_CALL = /\brequire\s*\(\s*([^)]*?)\s*\)/g;

interface ImportRef {
  readonly specifier: string;
  /** Erased at build time, so it cannot reach a writer; the token check still sees its specifier. */
  readonly typeOnly: boolean;
  /** Named bindings for `import { a, b as c }`; null when the form has none to inspect. */
  readonly names: readonly string[] | null;
  /** True for a default or namespace import, which cannot be narrowed to named bindings. */
  readonly bulk: boolean;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function namedBindings(clause: string): { names: string[]; bulk: boolean } {
  const braces = clause.match(/\{([^}]*)\}/);
  const outside = clause.replace(/\{[^}]*\}/, "").replace(/[\s,]/g, "");
  const names = (braces?.[1] ?? "")
    .split(",")
    .map((part) => part.trim())
    // An inline `type` binding is erased at build time.
    .filter((part) => part !== "" && !/^type\s/.test(part))
    .map((part) => part.split(/\s+as\s+/)[0]?.trim() ?? "");
  return { names, bulk: outside.length > 0 };
}

function importsIn(code: string): { refs: ImportRef[]; unanalysable: string[] } {
  const refs: ImportRef[] = [];
  const unanalysable: string[] = [];

  for (const match of code.matchAll(STATIC_IMPORT)) {
    const clause = match[1] ?? "";
    const typeOnly = /^type\b/.test(match[0].replace(/^import\s+/, ""));
    const { names, bulk } = namedBindings(clause);
    refs.push({ specifier: match[2] as string, typeOnly, names, bulk });
  }
  for (const match of code.matchAll(SIDE_EFFECT_IMPORT)) {
    refs.push({ specifier: match[1] as string, typeOnly: false, names: null, bulk: false });
  }
  for (const match of code.matchAll(EXPORT_FROM)) {
    // Re-exports pass bindings through unchecked, so they are treated as a whole-module use.
    refs.push({ specifier: match[1] as string, typeOnly: false, names: null, bulk: true });
  }
  for (const pattern of [DYNAMIC_IMPORT, REQUIRE_CALL]) {
    for (const match of code.matchAll(pattern)) {
      const arg = (match[1] ?? "").trim();
      const literal = arg.match(/^["']([^"']+)["']$/);
      if (literal)
        refs.push({ specifier: literal[1] as string, typeOnly: false, names: null, bulk: true });
      else unanalysable.push(arg);
    }
  }
  return { refs, unanalysable };
}

/** Resolves a relative specifier to a src-relative module path with its extension stripped. */
function srcRelative(fromFile: string, specifier: string): string {
  return posix
    .normalize(posix.join(posix.dirname(fromFile), specifier))
    .replace(/\.(js|ts|tsx)$/, "");
}

function violationsInFile(file: string, source: string): string[] {
  const code = stripComments(source);
  const found: string[] = [];

  for (const { label, pattern } of FORBIDDEN_TOKENS) {
    if (pattern.test(code)) found.push(`${file}: mentions \`${label}\``);
  }

  const { refs, unanalysable } = importsIn(code);
  for (const arg of unanalysable) {
    found.push(`${file}: dynamic import/require of a non-literal (${arg}) cannot be checked`);
  }

  for (const ref of refs) {
    if (ref.typeOnly) continue;
    const { specifier } = ref;
    if (!specifier.startsWith(".")) {
      const allowed = PACKAGE_ALLOWLIST.includes(specifier);
      if (!allowed) found.push(`${file}: imports \`${specifier}\`, which is not allowlisted`);
      continue;
    }
    if (/\.css$/.test(specifier)) continue;

    const target = srcRelative(file, specifier);
    if (target.startsWith(`${REHEARSAL_DIR}/`)) continue;
    const narrow = NAMED_ONLY[target];
    if (narrow) {
      const extra = (ref.names ?? []).filter((name) => !narrow.includes(name));
      if (ref.bulk || ref.names === null || extra.length > 0) {
        found.push(
          `${file}: imports \`${target}\` beyond [${narrow.join(", ")}]${
            extra.length > 0 ? ` (${extra.join(", ")})` : ""
          }`
        );
      }
      continue;
    }
    if (!MODULE_ALLOWLIST.includes(target)) {
      found.push(`${file}: imports \`${target}\`, which is not allowlisted`);
    }
  }
  return found;
}

function rehearsalSources(srcRoot: string): string[] {
  const dir = join(srcRoot, REHEARSAL_DIR);
  const inFolder = readdirSync(dir, { recursive: true, encoding: "utf-8" })
    .map((file) => `${REHEARSAL_DIR}/${file.split(sep).join("/")}`)
    .filter((file) => SOURCE_FILE.test(file) && !TEST_FILE.test(file));
  return [...inFolder, REHEARSAL_PAGE].sort();
}

function findViolations(srcRoot: string): string[] {
  return rehearsalSources(srcRoot).flatMap((file) =>
    violationsInFile(file, readFileSync(join(srcRoot, file), "utf-8"))
  );
}

describe("rehearsal no-write guard (SC-5)", () => {
  it("passes on the current tree", () => {
    expect(
      findViolations(SRC_ROOT),
      "The rehearsal may only read. Remove the import, or allowlist it here with a reason."
    ).toEqual([]);
  });

  it("scans the page and a real set of rehearsal sources", () => {
    const files = rehearsalSources(SRC_ROOT);
    expect(files).toContain(REHEARSAL_PAGE);
    expect(files).toContain(`${REHEARSAL_DIR}/simulate-service.ts`);
    expect(files.some((file) => TEST_FILE.test(file))).toBe(false);
  });
});

describe("rehearsal no-write guard rejects writers (negative fixtures)", () => {
  const roots: string[] = [];

  function fixtureRoot(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "rehearsal-guard-"));
    roots.push(root);
    const base: Record<string, string> = {
      [`${REHEARSAL_DIR}/ok.ts`]: 'import { useState } from "react";\nexport const a = useState;\n',
      [REHEARSAL_PAGE]: "export const page = 1;\n",
      ...files,
    };
    for (const [file, source] of Object.entries(base)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), source);
    }
    return root;
  }

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("is clean for a harmless fixture", () => {
    expect(findViolations(fixtureRoot({}))).toEqual([]);
  });

  it("fails a static import of a mutation hook from a mixed module", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/bad.ts`]:
        'import { useFloorPlans, useCloneFloorPlan } from "../../hooks/useFloorPlans";\nexport const x = [useFloorPlans, useCloneFloorPlan];\n',
    });
    const found = findViolations(root);
    expect(found.join("\n")).toMatch(/bad\.ts.*useCloneFloorPlan/);
  });

  it("fails a dynamic import of the API client", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/bad.ts`]: 'export const load = () => import("@mbe/api-client");\n',
    });
    const found = findViolations(root);
    expect(found.join("\n")).toMatch(/bad\.ts.*@mbe\/api-client/);
  });

  it("fails a file containing a fetch call", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/bad.ts`]: 'export const go = () => fetch("/api/v1/reservations");\n',
    });
    expect(findViolations(root).join("\n")).toMatch(/bad\.ts.*fetch\(/);
  });

  it("parses export-from, side-effect and non-literal dynamic forms", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/reexport.ts`]: 'export * from "../../hooks/useReservations";\n',
      [`${REHEARSAL_DIR}/effect.ts`]: 'import "../../hooks/useSSESync";\n',
      [`${REHEARSAL_DIR}/dyn.ts`]: "export const load = (name: string) => import(name);\n",
    });
    const found = findViolations(root).join("\n");
    expect(found).toMatch(/reexport\.ts.*hooks\/useReservations/);
    expect(found).toMatch(/effect\.ts.*hooks\/useSSESync/);
    expect(found).toMatch(/dyn\.ts.*non-literal/);
  });

  it("allows only the named read hooks from the mixed modules", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/reads.ts`]:
        'import { useTables } from "../../hooks/useTables.js";\nimport { useFloorPlans, useFloorPlan, type X } from "../../hooks/useFloorPlans";\nexport const r = [useTables, useFloorPlans, useFloorPlan];\n',
    });
    expect(findViolations(root)).toEqual([]);
  });

  it("rejects a default or namespace import of a mixed module", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/ns.ts`]:
        'import * as plans from "../../hooks/useFloorPlans";\nexport { plans };\n',
    });
    expect(findViolations(root).join("\n")).toMatch(/ns\.ts.*hooks\/useFloorPlans/);
  });

  it("ignores forbidden words that only appear in comments", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/comment.ts`]:
        "// never call fetch( or import @mbe/api-client here\n/* useApiClient */\nexport const c = 1;\n",
    });
    expect(findViolations(root)).toEqual([]);
  });

  it("picks up a new file without editing the test", () => {
    const root = fixtureRoot({
      [`${REHEARSAL_DIR}/deep/nested/new-file.tsx`]:
        'import { x } from "left-pad";\nexport const y = x;\n',
    });
    expect(findViolations(root).join("\n")).toMatch(/new-file\.tsx.*left-pad/);
  });
});
