/**
 * Auto-merge rules for improvement PRs.
 *
 * Classifies PR file changes as low-risk (auto-merge eligible) or
 * high-risk (requires human review). Used by the auto-merge workflow
 * to decide whether improvement-labeled PRs can merge automatically.
 *
 * Usage:
 *   import { shouldAutoMerge, classifyFiles } from "./improvement-merge-rules.mjs";
 */

export const LOW_RISK_PATTERNS = [
  /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/,
  /^(docs|\.github|metrics|\.claude)\//,
  /\.(md|txt|json|jsonl|yml|yaml|css|scss)$/,
  /^(README|CHANGELOG|LICENSE|CONTRIBUTING)/i,
  /\.(config|rc)\.(ts|js|mjs|json)$/,
  /^scripts\//,
  /^plugins\//,
  /\.module\.css$/,
  /\/styles?\//,
  /\/theme\//,
];

export const HIGH_RISK_PATTERNS = [
  /\/(pages|views|routes)\//,
  /\/(middleware|auth|security)\//,
  /\/app\.(ts|tsx|js|jsx)$/,
  /\/index\.(ts|tsx|js|jsx)$/,
  /prisma\/migrations\//,
  /Dockerfile/,
  /\.env/,
];

const A11Y_ONLY_MARKERS = [/aria-/i, /role=/i, /tabindex/i, /alt=/i, /sr-only/i, /focus-visible/i];

function isLowRiskFile(filePath) {
  return LOW_RISK_PATTERNS.some((re) => re.test(filePath));
}

function isHighRiskFile(filePath) {
  return HIGH_RISK_PATTERNS.some((re) => re.test(filePath));
}

function isA11yOnlyDiff(diffs) {
  if (!diffs || diffs.length === 0) return false;
  return diffs.every((d) => {
    const addedLines = (d.patch ?? "")
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    if (addedLines.length === 0) return true;
    return addedLines.every((line) => A11Y_ONLY_MARKERS.some((re) => re.test(line)));
  });
}

export function classifyFiles(files, diffs) {
  if (files.length === 0) return "low";

  if (diffs && isA11yOnlyDiff(diffs)) return "low";

  for (const file of files) {
    if (isHighRiskFile(file) && !isLowRiskFile(file)) {
      return "high";
    }
  }

  const hasUnclassified = files.some((f) => !isLowRiskFile(f) && !isHighRiskFile(f));
  if (hasUnclassified) {
    const unknownFiles = files.filter((f) => !isLowRiskFile(f));
    if (unknownFiles.length > 0) return "high";
  }

  return "low";
}

export function shouldAutoMerge(pr) {
  const hasImprovementLabel = (pr.labels ?? []).includes("improvement");
  if (!hasImprovementLabel) return false;
  if (!pr.ciPassed) return false;

  const risk = classifyFiles(pr.files ?? [], pr.diffs);
  return risk === "low";
}
