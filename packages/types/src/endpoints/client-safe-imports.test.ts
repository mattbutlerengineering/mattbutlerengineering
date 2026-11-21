/**
 * Every endpoint definition module ships in the client bundle (via
 * @mbe/api-client), so none may import server-only code. Checks every
 * definition file in this directory, not just guests.ts, and every import
 * shape: `from "x"`, side-effect `import "x"`, and dynamic `import("x")`.
 */
import { describe, expect, it } from "vitest";
const SERVER_ONLY = /fastify|json-schema|prisma|^node:/;

function importSpecifiers(source: string): string[] {
  const shapes = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return shapes.flatMap((re) => [...source.matchAll(re)].map((m) => m[1] ?? ""));
}

// Vite resolves the glob at build time; every non-test, non-declaration module here.
const SOURCES: Record<string, string> = import.meta.glob(["./*.ts", "!./*.test.ts", "!./*.d.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const DEFINITION_FILES = Object.keys(SOURCES).map((path) => path.replace("./", ""));

describe("importSpecifiers", () => {
  it("sees named, side-effect and dynamic imports, with either quote style", () => {
    const source = [
      'import { z } from "zod";',
      "import 'fastify/types';",
      'const m = await import("@prisma/client");',
      'export { x } from "./define.js";',
    ].join("\n");
    expect(importSpecifiers(source).sort()).toEqual(
      ["./define.js", "@prisma/client", "fastify/types", "zod"].sort()
    );
  });
});

describe("endpoint definitions are client-safe", () => {
  it("finds the definition files", () => {
    expect(DEFINITION_FILES).toEqual(expect.arrayContaining(["guests.ts", "define.ts"]));
  });

  it.each(DEFINITION_FILES.map((file) => [file] as const))(
    "%s imports no server-only module",
    (file) => {
      const specifiers = importSpecifiers(SOURCES[`./${file}`] ?? "");
      for (const specifier of specifiers) {
        expect(specifier, `${file} imports ${specifier}`).not.toMatch(SERVER_ONLY);
      }
    }
  );
});
