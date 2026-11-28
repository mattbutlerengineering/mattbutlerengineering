import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname);
const RIALTO_SRC = resolve(__dirname, "../../../packages/rialto/src");

function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.some((e) => name.endsWith(e)) ? [p] : [];
  });
}

const DECL = /(--rialto-[\w-]+)\s*:/g;
const USE = /var\(\s*(--rialto-[\w-]*\w)(?![\w-])(?!\$\{)/g;

function collect(files: string[], re: RegExp): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(re)) {
      const token = m[1];
      if (token && !out.has(token)) out.set(token, f);
    }
  }
  return out;
}

describe("rialto-web design token references", () => {
  it("references no --rialto-* token that nothing defines", () => {
    const defined = new Set([
      ...collect(walk(RIALTO_SRC, [".css", ".ts", ".tsx"]), DECL).keys(),
      ...collect(walk(SRC, [".css", ".ts", ".tsx"]), DECL).keys(),
    ]);
    const used = collect(
      walk(SRC, [".css", ".tsx", ".ts"]).filter((f) => !f.endsWith(".test.ts")),
      USE
    );
    const undefinedRefs = [...used]
      .filter(([token]) => !defined.has(token))
      .map(([token, file]) => `${token} (${file.replace(SRC, "src")})`);
    expect(undefinedRefs).toEqual([]);
  });
});
