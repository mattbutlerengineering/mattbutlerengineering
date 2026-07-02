import fs from "node:fs";
import path from "node:path";
import { checkStaleReferences } from "./lib/markdown-refs.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

/**
 * Detects "instruction rot" in key AI instruction files.
 * Checks for:
 * 1. Dead internal file links in Markdown files (via the shared markdown-ref
 *    extractor also used by check-doc-freshness.mjs).
 * 2. References to deleted packages.
 * 3. References to deleted apps.
 */

export const FILES_TO_CHECK = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  "llms.txt",
  "llms-full.txt",
  ".cursorrules",
];

/**
 * Find dead `[text](link)` references in the given instruction files,
 * reusing the shared markdown-ref extractor's link parsing (skips http(s),
 * anchors, and mailto links; resolves relative paths).
 */
export function findDeadLinkFindings(root, files = FILES_TO_CHECK) {
  const findings = [];

  for (const file of files) {
    const filePath = path.resolve(root, file);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, "utf-8");
    const stale = checkStaleReferences(content, filePath).filter(
      (ref) => ref.type === "markdown-link"
    );

    for (const ref of stale) {
      findings.push({
        file,
        type: "dead-link",
        reference: ref.referencedPath,
        resolvedPath: ref.resolvedPath,
      });
    }
  }

  return findings;
}

/** Find `packages/<name>` or `apps/<name>` references whose target no longer exists. */
export function findDeletedPackageOrAppFindings(root, files = FILES_TO_CHECK) {
  const findings = [];

  for (const file of files) {
    const filePath = path.resolve(root, file);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf-8");

    for (const [type, re] of [
      ["deleted-package", /packages\/([a-zA-Z0-9-]+)/g],
      ["deleted-app", /apps\/([a-zA-Z0-9-]+)/g],
    ]) {
      for (const ref of content.match(re) || []) {
        if (!fs.existsSync(path.resolve(root, ref))) {
          findings.push({ file, type, reference: ref });
        }
      }
    }
  }

  return findings;
}

export function findInstructionRotFindings(root, files = FILES_TO_CHECK) {
  return [...findDeadLinkFindings(root, files), ...findDeletedPackageOrAppFindings(root, files)];
}

function formatFinding(finding) {
  switch (finding.type) {
    case "dead-link":
      return `${finding.file}: Dead link to ${finding.reference} (resolved to ${finding.resolvedPath})`;
    case "deleted-package":
      return `${finding.file}: Reference to deleted package ${finding.reference}`;
    case "deleted-app":
      return `${finding.file}: Reference to deleted app ${finding.reference}`;
    default:
      return `${finding.file}: ${finding.reference}`;
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("detect-instruction-rot.mjs");

if (isMain) {
  console.log("Checking for instruction rot...");
  const root = process.cwd();
  const findings = findInstructionRotFindings(root);

  for (const finding of findings) {
    console.error(`[ROT] ${formatFinding(finding)}`);
  }

  const exitCode = runCheck({
    name: "instruction rot",
    findings,
    passMessage: "✓ No instruction rot detected.",
    failMessage: `Found ${findings.length} instances of instruction rot.`,
  });
  process.exit(exitCode);
}
