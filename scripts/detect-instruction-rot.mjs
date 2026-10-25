import fs from "node:fs";
import path from "node:path";
import { checkStaleReferences } from "./lib/markdown-refs.mjs";
import { runCheck } from "./lib/fitness-check.mjs";
import {
  classifySkillReference,
  collectSkillDirectories,
  extractSkillReferences,
} from "./check-skill-references.mjs";

/**
 * Detects "instruction rot" in key AI instruction files.
 * Checks for:
 * 1. Dead internal file links in Markdown files (via the shared markdown-ref
 *    extractor also used by check-doc-freshness.mjs).
 * 2. References to deleted packages.
 * 3. References to deleted apps.
 * 4. Stale references: `/slash-command` names that resolve to no skill and
 *    `scripts/<file>` paths that do not exist.
 *
 * Files checked: the fixed top-level list below plus every
 * `.claude/rules/*.md`, discovered by glob so new rule files are covered
 * automatically.
 *
 * Stale-reference false-positive policy (check 4):
 *  - Skill names resolve through check-skill-references.mjs (repo skills,
 *    plugin skills, `/plugin:skill`, and its DECLARED_NON_REPO_REFERENCES
 *    registry — the allowlist of documented user-level skills like /tdd).
 *    Add new intentional non-repo names THERE, with a reason.
 *  - Content inside fenced code blocks is ignored (illustrative examples).
 *  - Fences follow CommonMark: opened by 3+ backticks or tildes, closed only
 *    by the same character at least as long (so ````md may contain ```bash).
 *  - `<!-- rot-ignore: scripts/old.mjs, /old-skill -->` exempts exactly the
 *    named references on that line (historical prose); any other stale
 *    reference on the same line is still reported.
 */

export const FILES_TO_CHECK = [
  "CLAUDE.md",
  "docs/claude-reference.md",
  "AGENTS.md",
  "docs/agents-reference.md",
  "GEMINI.md",
  "llms.txt",
  "llms-full.txt",
  ".cursorrules",
];

const RULES_DIR = ".claude/rules";
const IGNORE_MARKER_RE = /<!--\s*rot-ignore:\s*([^>]*?)\s*-->/g;
const SCRIPT_PATH_RE =
  /(?<![\w/.-])(?:\.\/)?scripts\/[\w.-]+(?:\/[\w.-]+)*\.(?:mjs|cjs|js|ts|sh)\b/g;

/** FILES_TO_CHECK plus every `.claude/rules/*.md` found on disk. */
export function discoverInstructionFiles(root) {
  const rulesDir = path.resolve(root, RULES_DIR);
  const rules = fs.existsSync(rulesDir)
    ? fs
        .readdirSync(rulesDir)
        .filter((name) => name.endsWith(".md"))
        .sort()
        .map((name) => `${RULES_DIR}/${name}`)
    : [];
  return [...FILES_TO_CHECK, ...rules];
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Per-line view of a markdown body: fenced lines are blanked (CommonMark
 * fence matching), and named rot-ignore markers are stripped from the text
 * and returned as the set of references they exempt. Line numbers preserved.
 */
function maskIgnoredContent(content) {
  let fence = null;
  return content.split("\n").map((line) => {
    const match = FENCE_RE.exec(line);
    if (fence) {
      const closes =
        match && match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim();
      if (closes) fence = null;
      return { text: "", ignored: new Set() };
    }
    if (match) {
      fence = { char: match[1][0], length: match[1].length };
      return { text: "", ignored: new Set() };
    }
    const ignored = new Set();
    const text = line.replace(IGNORE_MARKER_RE, (_, names) => {
      for (const name of names.split(/[\s,]+/).filter(Boolean)) ignored.add(name);
      return "";
    });
    return { text, ignored };
  });
}

/** Find unresolvable `/skill` references and nonexistent `scripts/<file>` paths. */
export function findStaleReferenceFindings(root, files = discoverInstructionFiles(root)) {
  const findings = [];
  const world = collectSkillDirectories(root);

  // Markdown only: llms*.txt and .cursorrules are generated/synced copies whose
  // `/route` strings are not skill references (and would double-report).
  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const filePath = path.resolve(root, file);
    if (!fs.existsSync(filePath)) continue;
    const lines = maskIgnoredContent(fs.readFileSync(filePath, "utf-8"));

    for (const [index, { text, ignored }] of lines.entries()) {
      const line = index + 1;
      for (const { name } of extractSkillReferences(text)) {
        const reference = `/${name}`;
        if (ignored.has(reference)) continue;
        if (classifySkillReference(name, world).kind === "unresolved") {
          findings.push({ file, type: "stale-skill", reference, line });
        }
      }
      for (const match of text.matchAll(SCRIPT_PATH_RE)) {
        const reference = match[0].replace(/^\.\//, "");
        // `[x](scripts/y.mjs)` is the dead-link check's job; don't double-report.
        if (text.slice(0, match.index).endsWith("](")) continue;
        if (ignored.has(reference) || fs.existsSync(path.resolve(root, reference))) continue;
        findings.push({ file, type: "stale-script", reference, line });
      }
    }
  }

  return findings;
}

/**
 * Find dead `[text](link)` references in the given instruction files,
 * reusing the shared markdown-ref extractor's link parsing (skips http(s),
 * anchors, and mailto links; resolves relative paths).
 */
export function findDeadLinkFindings(root, files = discoverInstructionFiles(root)) {
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
export function findDeletedPackageOrAppFindings(root, files = discoverInstructionFiles(root)) {
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

export function findInstructionRotFindings(root, files = discoverInstructionFiles(root)) {
  return [
    ...findDeadLinkFindings(root, files),
    ...findDeletedPackageOrAppFindings(root, files),
    ...findStaleReferenceFindings(root, files),
  ];
}

function formatFinding(finding) {
  switch (finding.type) {
    case "dead-link":
      return `${finding.file}: Dead link to ${finding.reference} (resolved to ${finding.resolvedPath})`;
    case "deleted-package":
      return `${finding.file}: Reference to deleted package ${finding.reference}`;
    case "deleted-app":
      return `${finding.file}: Reference to deleted app ${finding.reference}`;
    case "stale-skill":
      return `${finding.file}:${finding.line}: Skill reference ${finding.reference} resolves to no skill (add the skill, remove the reference, or declare it in check-skill-references.mjs)`;
    case "stale-script":
      return `${finding.file}:${finding.line}: Script path ${finding.reference} does not exist (exempt historical mentions with <!-- rot-ignore: ${finding.reference} -->)`;
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
