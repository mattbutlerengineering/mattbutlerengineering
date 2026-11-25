import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = dirname(fileURLToPath(import.meta.url));
const APP = dirname(SRC);
const REPO = join(APP, "..", "..");

/**
 * In-app feedback files GitHub issues from the agent service (`/api/gen/feedback`). The token
 * lives only there, in `FEEDBACK_GITHUB_TOKEN`. Nothing the browser loads may name it, read any
 * GitHub token env var, or embed a token literal: a Vite build inlines every `VITE_*` variable and
 * anything reaching `import.meta.env` into the public bundle.
 */
const TOKEN_REFERENCES: ReadonlyArray<readonly [RegExp, string]> = [
  [/FEEDBACK_GITHUB_TOKEN/, "FEEDBACK_GITHUB_TOKEN"],
  [/\bGITHUB_TOKEN\b/, "GITHUB_TOKEN"],
  [/\bGH_TOKEN\b/, "GH_TOKEN"],
  [/VITE_[A-Z_]*GITHUB[A-Z_]*/, "a VITE_*GITHUB* variable"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/, "a GitHub token literal"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "a fine-grained GitHub token literal"],
  [/@mbe\/gh-client/, "@mbe/gh-client (a Node-only package)"],
];

function files(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, pattern);
    return pattern.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

function offenders(paths: string[]): string[] {
  return paths.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    return TOKEN_REFERENCES.filter(([pattern]) => pattern.test(text)).map(
      ([, label]) => `${relative(REPO, file)}: ${label}`
    );
  });
}

describe("no GitHub token reaches the client", () => {
  it("hospitality source never references a GitHub token", () => {
    expect(offenders(files(SRC, /\.(ts|tsx)$/))).toEqual([]);
  });

  it("the shared client code the feedback flow runs through never references one", () => {
    const shared = [
      join(REPO, "packages", "api-client", "src"),
      join(REPO, "packages", "rialto", "src", "components", "FeedbackDialog"),
    ];
    expect(offenders(shared.flatMap((dir) => files(dir, /\.(ts|tsx)$/)))).toEqual([]);
  });

  it("a built bundle, when present, carries no GitHub token reference", () => {
    // Only runs against a local or CI `vite build`; absent dist is not a failure.
    expect(offenders(files(join(APP, "dist"), /\.(js|html)$/))).toEqual([]);
  });
});
