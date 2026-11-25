import { z } from "zod";

const GITHUB_TIMEOUT_MS = 5000;

/** The repo feedback issues are filed in (public). */
const FEEDBACK_REPO = { owner: "mattbutlerengineering", name: "mattbutlerengineering" };

/**
 * Dedicated secret: a fine-grained PAT scoped to this one repo with only
 * "Issues: read and write". Deliberately NOT the broader `GITHUB_TOKEN` the
 * agent service uses for PR work, so a leak of one cannot file or merge code.
 */
export const FEEDBACK_TOKEN_ENV = "FEEDBACK_GITHUB_TOKEN";

const FEEDBACK_LABELS = ["feedback", "needs-triage"] as const;

const FEEDBACK_MESSAGE_MIN = 10;
const FEEDBACK_MESSAGE_MAX = 2000;
const TITLE_EXCERPT_MAX = 60;
const ZERO_WIDTH_SPACE = "​";

export const feedbackBodySchema = z.object({
  type: z.enum(["bug", "idea", "other"], { message: "Choose bug, idea or other." }),
  message: z
    .string({ message: "Tell us what happened." })
    .trim()
    .min(FEEDBACK_MESSAGE_MIN, `Please write at least ${FEEDBACK_MESSAGE_MIN} characters.`)
    .max(FEEDBACK_MESSAGE_MAX, `Please keep it under ${FEEDBACK_MESSAGE_MAX} characters.`),
  email: z
    .string()
    .trim()
    .max(254, "That email address is too long.")
    .email("Enter a valid email address, or leave it blank.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  context: z.object({
    app: z.string().trim().max(40),
    route: z.string().trim().max(200),
    viewport: z.string().trim().max(20),
    version: z.string().trim().max(80),
  }),
});

export type FeedbackBody = z.infer<typeof feedbackBodySchema>;

export interface FeedbackIssueInput {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

export interface FeedbackIssueResult {
  readonly number: number;
  readonly url: string;
}

/**
 * Breaks the two things GitHub would act on in untrusted text: `@name`
 * mentions (notifications) and `#123` references (cross-links, closing
 * keywords). A zero-width space keeps the text readable.
 */
function neutralize(text: string): string {
  return text.replace(/@/g, `@${ZERO_WIDTH_SPACE}`).replace(/#(?=\d)/g, `#${ZERO_WIDTH_SPACE}`);
}

/** One line, for titles and context values. */
function oneLine(text: string): string {
  return neutralize(text.replace(/\s+/g, " ").trim());
}

/** A fence longer than any backtick run inside, so the text cannot close it early. */
function fence(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const marks = "`".repeat(Math.max(3, longestRun + 1));
  return `${marks}\n${text}\n${marks}`;
}

function buildFeedbackTitle(type: FeedbackBody["type"], message: string): string {
  const excerpt = oneLine(message).slice(0, TITLE_EXCERPT_MAX).trimEnd();
  return `[Feedback] ${type}: ${excerpt}`;
}

/** The reporter email is intentionally absent: the repo is public. */
function buildFeedbackBody(feedback: FeedbackBody, userId: string): string {
  const { context } = feedback;
  const contextLines = [
    `app: ${oneLine(context.app)}`,
    `route: ${oneLine(context.route)}`,
    `viewport: ${oneLine(context.viewport)}`,
    `version: ${oneLine(context.version)}`,
    `user: ${oneLine(userId)}`,
  ].join("\n");

  return [
    fence(neutralize(feedback.message)),
    "",
    "**Context**",
    "",
    fence(contextLines),
    "",
    "_Filed from in-app feedback. Triage before labelling `ready`._",
  ].join("\n");
}

export function buildFeedbackIssue(feedback: FeedbackBody, userId: string): FeedbackIssueInput {
  return {
    title: buildFeedbackTitle(feedback.type, feedback.message),
    body: buildFeedbackBody(feedback, userId),
    labels: FEEDBACK_LABELS,
  };
}

export function isFeedbackConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[FEEDBACK_TOKEN_ENV] ?? "").trim().length > 0;
}

/**
 * Files the issue with one async `fetch` using the dedicated token. Async on
 * purpose: `@mbe/gh-client`'s REST transport blocks the event loop with
 * `execFileSync`, which would stall every SSE stream on this service. Errors
 * carry only the HTTP status, never upstream text.
 */
export async function createFeedbackIssue(
  input: FeedbackIssueInput,
  env: NodeJS.ProcessEnv = process.env
): Promise<FeedbackIssueResult> {
  const token = (env[FEEDBACK_TOKEN_ENV] ?? "").trim();
  if (!token) throw new Error(`${FEEDBACK_TOKEN_ENV} is not set`);

  const response = await fetch(
    `https://api.github.com/repos/${FEEDBACK_REPO.owner}/${FEEDBACK_REPO.name}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "mbe-feedback",
      },
      body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    }
  );
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);

  const issue = (await response.json()) as { number?: unknown; html_url?: unknown };
  if (typeof issue.number !== "number" || typeof issue.html_url !== "string") {
    throw new Error("GitHub answered without an issue number and url");
  }
  return { number: issue.number, url: issue.html_url };
}
