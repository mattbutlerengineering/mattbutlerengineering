import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ── Types ───────────────────────────────────────────────────────────

export interface ReviewComment {
  readonly threadId: string;
  readonly author: string;
  readonly body: string;
  readonly path: string | null;
  readonly line: number | null;
}

export interface CIFailure {
  readonly checkName: string;
  readonly conclusion: string;
  readonly logSnippet: string;
}

export interface FeedbackContext {
  readonly prNumber: number;
  readonly reviewComments: readonly ReviewComment[];
  readonly ciFailures: readonly CIFailure[];
  readonly reviewDecision: string;
}

export interface PollResult {
  readonly context: FeedbackContext;
  readonly fingerprint: string;
}

// ── Review comment extraction ───────────────────────────────────────

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

interface GraphQLThreadNode {
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

export async function fetchUnresolvedComments(
  owner: string,
  repo: string,
  prNumber: number,
  repoPath: string
): Promise<{ comments: readonly ReviewComment[]; reviewDecision: string }> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "api", "graphql",
        "-f", `query=${REVIEW_THREADS_QUERY}`,
        "-f", `owner=${owner}`,
        "-f", `name=${repo}`,
        "-F", `number=${prNumber}`,
      ],
      { cwd: repoPath }
    );

    const response = JSON.parse(stdout) as GraphQLResponse;
    const pr = response.data.repository.pullRequest;
    const threads = pr.reviewThreads.nodes;

    const comments: ReviewComment[] = threads
      .filter((t) => !t.isResolved && t.comments.nodes.length > 0)
      .map((t) => {
        const comment = t.comments.nodes[0];
        return {
          threadId: t.id,
          author: comment.author.login,
          body: comment.body,
          path: comment.path,
          line: comment.line,
        };
      });

    return {
      comments,
      reviewDecision: pr.reviewDecision ?? "PENDING",
    };
  } catch {
    return { comments: [], reviewDecision: "UNKNOWN" };
  }
}

// ── CI failure extraction ───────────────────────────────────────────

interface CheckResult {
  readonly name: string;
  readonly state: string;
  readonly conclusion: string;
}

export async function fetchCIFailures(
  prNumber: number,
  repoPath: string,
  tailLines = 100
): Promise<readonly CIFailure[]> {
  try {
    const { stdout: checksJson } = await execFileAsync(
      "gh",
      ["pr", "checks", String(prNumber), "--json", "name,state,conclusion"],
      { cwd: repoPath }
    );

    const checks = JSON.parse(checksJson) as readonly CheckResult[];
    const failed = checks.filter((c) => c.conclusion === "failure");

    if (failed.length === 0) return [];

    // Get log snippet from the most recent failed run
    let logSnippet = "";
    try {
      const { stdout: runJson } = await execFileAsync(
        "gh",
        ["run", "list", "--status", "failure", "--limit", "1", "--json", "databaseId"],
        { cwd: repoPath }
      );
      const runs = JSON.parse(runJson) as readonly { databaseId: number }[];
      if (runs.length > 0) {
        const { stdout: logs } = await execFileAsync(
          "gh",
          ["run", "view", String(runs[0].databaseId), "--log-failed"],
          { cwd: repoPath, maxBuffer: 5 * 1024 * 1024 }
        );
        const lines = logs.split("\n");
        logSnippet = lines.slice(-tailLines).join("\n");
      }
    } catch {
      logSnippet = "(Could not fetch CI logs)";
    }

    return failed.map((f) => ({
      checkName: f.name,
      conclusion: f.conclusion,
      logSnippet,
    }));
  } catch {
    return [];
  }
}

// ── Poll orchestrator ───────────────────────────────────────────────

function computeFingerprint(comments: readonly ReviewComment[]): string {
  return comments
    .map((c) => c.threadId)
    .sort()
    .join(",");
}

export async function pollForFeedback(
  owner: string,
  repo: string,
  prNumber: number,
  repoPath: string,
  lastFingerprint: string
): Promise<PollResult | null> {
  const { comments, reviewDecision } = await fetchUnresolvedComments(
    owner, repo, prNumber, repoPath
  );

  const ciFailures = await fetchCIFailures(prNumber, repoPath);

  const fingerprint = computeFingerprint(comments);

  // No new feedback if fingerprint unchanged and no CI failures
  if (fingerprint === lastFingerprint && ciFailures.length === 0) {
    return null;
  }

  // No feedback at all
  if (comments.length === 0 && ciFailures.length === 0) {
    return null;
  }

  return {
    context: {
      prNumber,
      reviewComments: comments,
      ciFailures,
      reviewDecision,
    },
    fingerprint,
  };
}
