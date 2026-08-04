import { execFileSync } from "node:child_process";

export interface RepoSlug {
  owner: string;
  repo: string;
}

const REMOTE_URL_PATTERN = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/;

/** Parses `owner/repo` out of a `github.com` remote URL (SSH or HTTPS form). */
export function parseRepoSlug(remoteUrl: string): RepoSlug | null {
  const match = REMOTE_URL_PATTERN.exec(remoteUrl.trim());
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return { owner, repo };
}

export interface RepoResolverOptions {
  env?: NodeJS.ProcessEnv;
  /** Injected for tests — defaults to `git remote get-url origin`. */
  exec?: (cmd: string, args: string[]) => string;
}

function defaultExec(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf-8", timeout: 5_000 }).trim();
}

/**
 * Resolves the `owner/repo` the REST transport targets. Prefers
 * `GITHUB_REPOSITORY` (the convention already documented in
 * `scripts/acmm-regression-check.mjs` and set automatically by GitHub
 * Actions); falls back to parsing the local `origin` remote, matching how
 * `gh` itself infers the repo when no explicit flag is given.
 */
export function resolveRepoSlug(opts: RepoResolverOptions = {}): RepoSlug {
  const env = opts.env ?? process.env;
  const fromEnv = env.GITHUB_REPOSITORY;
  if (fromEnv) {
    const [owner, repo] = fromEnv.split("/");
    if (owner && repo) return { owner, repo };
  }

  const exec = opts.exec ?? defaultExec;
  const remoteUrl = exec("git", ["remote", "get-url", "origin"]);
  const parsed = parseRepoSlug(remoteUrl);
  if (!parsed) {
    throw new Error(
      "gh-client REST fallback could not determine the GitHub repo: set GITHUB_REPOSITORY=owner/repo " +
        "or configure a github.com 'origin' remote."
    );
  }
  return parsed;
}
