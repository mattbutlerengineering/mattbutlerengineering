// ── Evaluation prompt builder ───────────────────────────────────────
//
// Pure prompt construction for the LLM-as-judge evaluator: acceptance
// criteria / expected-file extraction and the final prompt assembly. No
// I/O, no LLM — independently testable. Extracted from
// `success-evaluator.ts`.

const MAX_DIFF_LENGTH = 50_000;

/**
 * Extract the body of a markdown section by heading text.
 * Uses indexOf for linear-time safety (no regex backtracking).
 * Returns null if the heading is not found.
 */
function extractMarkdownSection(text: string, headingPattern: RegExp): string | null {
  // Find the heading line-by-line to avoid ReDoS on the full text
  const lines = text.split("\n");
  let startIdx = -1;
  let charOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i])) {
      // Start capturing from the line after the heading
      startIdx = charOffset + lines[i].length + 1; // +1 for the \n
      break;
    }
    charOffset += lines[i].length + 1;
  }

  if (startIdx === -1 || startIdx >= text.length) return null;

  const body = text.slice(startIdx);

  // Find the next section boundary: "\n##" or "\n---"
  let endIdx = body.length;
  const nextHeading = body.indexOf("\n##");
  const nextHr = body.indexOf("\n---");

  if (nextHeading !== -1 && nextHeading < endIdx) endIdx = nextHeading;
  if (nextHr !== -1 && nextHr < endIdx) endIdx = nextHr;

  return body.slice(0, endIdx);
}

/**
 * Extract acceptance criteria from an issue body.
 * Looks for "## Acceptance Criteria" section with checkbox items.
 */
export function extractAcceptanceCriteria(taskDescription: string): readonly string[] {
  const sectionBody = extractMarkdownSection(taskDescription, /^##\s*Acceptance\s*Criteria\s*$/i);
  if (!sectionBody) return [];

  return sectionBody
    .split("\n")
    .filter((line) => /^\s*-\s*\[[ x]\]/.test(line))
    .map((line) => line.replace(/^\s*-\s*\[[ x]\]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Extract file paths mentioned in the task description.
 * Looks for "## Files to Modify" section or inline backtick paths.
 */
export function extractExpectedFiles(taskDescription: string): readonly string[] {
  const sectionBody = extractMarkdownSection(
    taskDescription,
    /^##\s*Files\s*to\s*(?:Modify|Create)/i
  );
  if (!sectionBody) return [];

  return sectionBody
    .split("\n")
    .map((line) => {
      const match = line.match(/`([^`]+\.\w+)`/);
      return match ? match[1] : "";
    })
    .filter(Boolean);
}

export function buildEvaluationPrompt(taskDescription: string, gitDiff: string): string {
  const truncatedDiff =
    gitDiff.length > MAX_DIFF_LENGTH
      ? gitDiff.slice(0, MAX_DIFF_LENGTH) + "\n\n... (diff truncated)"
      : gitDiff;

  const criteria = extractAcceptanceCriteria(taskDescription);
  const expectedFiles = extractExpectedFiles(taskDescription);

  const criteriaSection =
    criteria.length > 0
      ? [
          "",
          "## Acceptance Criteria (from the issue)",
          "Check each of these specifically against the diff:",
          ...criteria.map((c, i) => `${i + 1}. ${c}`),
          "",
          "If any acceptance criterion is NOT met by the diff, set passed=false and list the unmet criteria in issues.",
        ].join("\n")
      : "";

  const filesSection =
    expectedFiles.length > 0
      ? [
          "",
          "## Expected Files",
          "The task specified these files should be modified/created:",
          ...expectedFiles.map((f) => `- \`${f}\``),
          "",
          "Verify that the diff touches these files. If key files are missing from the diff, note it.",
        ].join("\n")
      : "";

  return [
    "You are evaluating whether a code change addresses a given task.",
    "Analyze the git diff and determine if it solves the stated task.",
    "",
    "## Task",
    taskDescription,
    "",
    "## Git Diff",
    "```diff",
    truncatedDiff,
    "```",
    criteriaSection,
    filesSection,
    "",
    "## General Evaluation Criteria",
    "- Does the diff make changes relevant to the task?",
    "- Are there obvious bugs or incomplete implementations?",
    "- Are there security issues introduced?",
    "- Is the scope appropriate (not too much, not too little)?",
    "",
    "Return your evaluation as JSON.",
  ].join("\n");
}
