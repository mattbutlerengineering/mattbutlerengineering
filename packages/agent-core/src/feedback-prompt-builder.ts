import type { FeedbackContext } from "./pr-feedback-poller.js";

/**
 * Build an agent prompt from PR feedback context.
 * Follows the OpenHands pattern: structured sections with
 * file/line locations and clear fix instructions.
 */
export function buildReviewFixPrompt(context: FeedbackContext): string {
  const sections: string[] = [
    "Fix the following feedback on your PR.\n",
  ];

  if (context.reviewComments.length > 0) {
    sections.push("## Review Comments\n");
    for (const c of context.reviewComments) {
      const location = c.path
        ? `File: ${c.path}${c.line ? `:${c.line}` : ""}`
        : "General comment";
      sections.push(`### ${location}\n**@${c.author}:** ${c.body}\n`);
    }
  }

  if (context.ciFailures.length > 0) {
    sections.push("## CI Failures\n");
    for (const f of context.ciFailures) {
      sections.push(
        `### ${f.checkName} (${f.conclusion})\n\`\`\`\n${f.logSnippet}\n\`\`\`\n`
      );
    }
  }

  sections.push(
    "## Instructions\n",
    "1. Read each comment and understand what change is requested.",
    "2. Make the fixes in the relevant files.",
    "3. Run tests to verify your fixes.",
    "4. Commit and push your changes.\n",
    "Do NOT create a new PR. Push to the existing branch.",
  );

  return sections.join("\n");
}
