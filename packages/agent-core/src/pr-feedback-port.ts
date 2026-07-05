import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Bound `gh` subprocess calls so a hang (GitHub API latency) fails fast. */
const GH_TIMEOUT_MS = 30_000;

// ── Types ───────────────────────────────────────────────────────────

export interface GraphQLThreadNode {
  readonly id: string;
  readonly isResolved: boolean;
  readonly comments: {
    readonly nodes: ReadonlyArray<{
      readonly body: string;
      readonly path: string | null;
      readonly line: number | null;
      readonly author: { readonly login: string };
    }>;
  };
}

export interface ReviewThreadsResult {
  readonly reviewDecision: string | null;
  readonly threads: readonly GraphQLThreadNode[];
}

export interface CheckResult {
  readonly name: string;
  readonly state: string;
  readonly conclusion: string;
}

export interface RepoOwnerResult {
  readonly owner: string;
  readonly repo: string;
}

/**
 * Injectable seam for the poller's GitHub calls. Tests supply a fake
 * implementation instead of mocking `node:child_process`.
 */
export interface PrFeedbackPort {
  fetchReviewThreads(
    owner: string,
    repo: string,
    prNumber: number,
    repoPath: string
  ): Promise<ReviewThreadsResult>;
  fetchChecks(prNumber: number, repoPath: string): Promise<readonly CheckResult[]>;
  fetchFailedRunId(repoPath: string): Promise<number | null>;
  fetchRunLogs(runId: number, repoPath: string): Promise<string>;
  getRepoOwner(repoPath: string): Promise<RepoOwnerResult>;
}

// ── Production implementation (backed by the `gh` CLI) ──────────────

const REVIEW_THREADS_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewDecision
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body, path, line, author { login } }
          }
        }
      }
    }
  }
}`;

interface GraphQLResponse {
  readonly data: {
    readonly repository: {
      readonly pullRequest: {
        readonly reviewDecision: string | null;
        readonly reviewThreads: {
          readonly nodes: readonly GraphQLThreadNode[];
        };
      };
    };
  };
}

/** Default production port — shells out to the `gh` CLI, identical to the pre-refactor calls. */
export const ghPrFeedbackPort: PrFeedbackPort = {
  async fetchReviewThreads(owner, repo, prNumber, repoPath) {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "api",
        "graphql",
        "-f",
        `query=${REVIEW_THREADS_QUERY}`,
        "-f",
        `owner=${owner}`,
        "-f",
        `name=${repo}`,
        "-F",
        `number=${prNumber}`,
      ],
      { cwd: repoPath, timeout: GH_TIMEOUT_MS }
    );

    const response = JSON.parse(stdout) as GraphQLResponse;
    const pr = response.data.repository.pullRequest;
    return { reviewDecision: pr.reviewDecision, threads: pr.reviewThreads.nodes };
  },

  async fetchChecks(prNumber, repoPath) {
    const { stdout } = await execFileAsync(
      "gh",
      ["pr", "checks", String(prNumber), "--json", "name,state,conclusion"],
      { cwd: repoPath, timeout: GH_TIMEOUT_MS }
    );
    return JSON.parse(stdout) as readonly CheckResult[];
  },

  async fetchFailedRunId(repoPath) {
    const { stdout } = await execFileAsync(
      "gh",
      ["run", "list", "--status", "failure", "--limit", "1", "--json", "databaseId"],
      { cwd: repoPath, timeout: GH_TIMEOUT_MS }
    );
    const runs = JSON.parse(stdout) as readonly { databaseId: number }[];
    return runs.length > 0 ? runs[0].databaseId : null;
  },

  async fetchRunLogs(runId, repoPath) {
    const { stdout } = await execFileAsync("gh", ["run", "view", String(runId), "--log-failed"], {
      cwd: repoPath,
      maxBuffer: 5 * 1024 * 1024,
      timeout: GH_TIMEOUT_MS,
    });
    return stdout;
  },

  async getRepoOwner(repoPath) {
    const { stdout } = await execFileAsync("gh", ["repo", "view", "--json", "owner,name"], {
      cwd: repoPath,
      timeout: GH_TIMEOUT_MS,
    });
    const parsed = JSON.parse(stdout) as { owner: { login: string }; name: string };
    return { owner: parsed.owner.login, repo: parsed.name };
  },
};
