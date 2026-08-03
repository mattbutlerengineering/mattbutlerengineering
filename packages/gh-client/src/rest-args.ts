/** Thrown when the REST fallback runs with no `gh` binary and no token. */
export class MissingGithubTokenError extends Error {
  constructor() {
    super(
      "gh-client: no `gh` binary on PATH and no GITHUB_TOKEN/GH_TOKEN in the environment. " +
        "Set GITHUB_TOKEN (or GH_TOKEN) to use the REST fallback."
    );
    this.name = "MissingGithubTokenError";
  }
}

/** Resolves the REST auth token, or throws {@link MissingGithubTokenError}. */
export function resolveToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (!token) throw new MissingGithubTokenError();
  return token;
}

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string[]>;
}

/**
 * Parses `gh`-CLI-style args (`["issue", "list", "--label", "ready", ...]`)
 * into positionals and repeatable `--flag value` pairs. Every flag in this
 * codebase's usage takes exactly one value, so a bare `--flag` at the end of
 * the array is recorded with an empty-string value rather than throwing.
 */
export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string[]> = {};

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = args[i + 1] ?? "";
      flags[key] = [...(flags[key] ?? []), value];
      i++;
    } else {
      positional.push(token);
    }
  }

  return { positional, flags };
}

/** First value of a flag, or undefined if it was never passed. */
export function flag(parsed: ParsedArgs, name: string): string | undefined {
  return parsed.flags[name]?.[0];
}

/** All values of a repeated flag, flattened on commas (gh accepts both forms). */
export function flagAll(parsed: ParsedArgs, name: string): string[] {
  return (parsed.flags[name] ?? []).flatMap((value) => value.split(",")).filter(Boolean);
}

/** True if `--json` was requested with a field list containing `field`. */
export function wantsJsonField(parsed: ParsedArgs, field: string): boolean {
  const fields = flag(parsed, "json") ?? "";
  return fields.split(",").includes(field);
}
