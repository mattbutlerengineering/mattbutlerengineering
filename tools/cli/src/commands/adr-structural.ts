import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

// ── Types ─────────────────────────────────────────────────────────────────

export interface StructuralViolation {
  file: string;
  rule: string;
  remedy: string;
}

interface AdrFields {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  date?: unknown;
  prohibited_patterns?: unknown;
}

const VALID_STATUSES = ["active", "superseded", "deprecated"];
const REQUIRED_FIELDS = ["id", "title", "status", "date"] as const;
const ID_PATTERN = /^ADR-\d{3}$/;
const README_ROW_PATTERN = /\[(ADR-\d+)\]\(([^)]+)\)/g;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// ── Frontmatter checks (per file) ────────────────────────────────────────

function checkFrontmatter(
  file: string,
  content: string,
  violations: StructuralViolation[]
): { id: string | null; patterns: string[] } {
  const match = content.match(/^---([\s\S]*?)---/);
  if (!match) {
    violations.push({
      file,
      rule: "frontmatter-missing",
      remedy: "Add a YAML frontmatter block (--- id/title/status/date ---) at the top of the file.",
    });
    return { id: null, patterns: [] };
  }

  let data: AdrFields;
  try {
    data = load(match[1]) ?? {};
  } catch (e) {
    violations.push({
      file,
      rule: "frontmatter-invalid",
      remedy: `Fix the YAML syntax error in the frontmatter block: ${(e as Error).message}`,
    });
    return { id: null, patterns: [] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!isNonEmptyString(data[field])) {
      violations.push({
        file,
        rule: "frontmatter-field-missing",
        remedy: `Add a non-empty "${field}" field to the frontmatter block.`,
      });
    }
  }

  const status = data.status;
  if (isNonEmptyString(status) && !VALID_STATUSES.includes(status)) {
    violations.push({
      file,
      rule: "status-invalid",
      remedy: `Set status to one of: ${VALID_STATUSES.join(", ")} (found "${status}").`,
    });
  }

  const id = isNonEmptyString(data.id) ? data.id : null;
  if (id) {
    if (!ID_PATTERN.test(id)) {
      violations.push({
        file,
        rule: "id-format-invalid",
        remedy: `Set id to the format ADR-NNN (e.g. ADR-014) — found "${id}".`,
      });
    } else if (!file.startsWith(`${id}-`)) {
      violations.push({
        file,
        rule: "id-filename-mismatch",
        remedy: `Rename the file to start with "${id}-" to match the frontmatter id.`,
      });
    }
  }

  const patterns = Array.isArray(data.prohibited_patterns)
    ? data.prohibited_patterns.filter((p): p is string => typeof p === "string")
    : [];

  for (const pattern of patterns) {
    try {
      // `pattern` comes from this ADR file's own `prohibited_patterns` frontmatter
      // (repo-controlled markdown, changed only via reviewed PRs) — not external/user
      // input. This call's sole purpose is to validate the pattern compiles; the
      // RegExp is discarded immediately and never used to match untrusted content
      // (issue #3410 triage).
      // eslint-disable-next-line security/detect-non-literal-regexp
      new RegExp(pattern);
    } catch (e) {
      violations.push({
        file,
        rule: "regex-uncompilable",
        remedy: `Fix the prohibited_patterns entry "${pattern}" — it fails to compile as a JS RegExp: ${(e as Error).message}`,
      });
    }
  }

  return { id: ID_PATTERN.test(id ?? "") ? id : null, patterns };
}

// ── Corpus-level checks ───────────────────────────────────────────────────

function checkUniqueAndSequentialIds(
  idsByFile: Map<string, string>,
  violations: StructuralViolation[]
): void {
  const filesById = new Map<string, string[]>();
  for (const [file, id] of idsByFile) {
    filesById.set(id, [...(filesById.get(id) ?? []), file]);
  }

  const numbers = new Set<number>();
  for (const [id, files] of filesById) {
    if (files.length > 1) {
      for (const file of files) {
        const others = files.filter((f) => f !== file).join(", ");
        violations.push({
          file,
          rule: "id-duplicate",
          remedy: `Change id "${id}" to a unique value — also used by ${others}.`,
        });
      }
    }
    numbers.add(Number(id.slice(4)));
  }

  if (numbers.size === 0) return;

  const missing: number[] = [];
  const max = Math.max(...numbers);
  for (let n = 1; n <= max; n++) {
    if (!numbers.has(n)) missing.push(n);
  }

  if (missing.length > 0) {
    const missingIds = missing.map((n) => `ADR-${String(n).padStart(3, "0")}`).join(", ");
    violations.push({
      file: "docs/adr",
      rule: "id-non-sequential",
      remedy: `Renumber ADRs so IDs form a gap-free sequence starting at ADR-001 — missing ${missingIds}.`,
    });
  }
}

function parseReadmeIndex(readmeContent: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of readmeContent.matchAll(README_ROW_PATTERN)) {
    const target = match[2];
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}

function checkIndexSync(adrDir: string, files: string[], violations: StructuralViolation[]): void {
  const readmePath = join(adrDir, "README.md");
  const readmeContent = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
  const indexCounts = parseReadmeIndex(readmeContent);

  for (const file of files) {
    const count = indexCounts.get(file) ?? 0;
    if (count === 0) {
      violations.push({
        file,
        rule: "index-unindexed",
        remedy: "Add a row for this ADR to the index table in docs/adr/README.md.",
      });
    } else if (count > 1) {
      violations.push({
        file,
        rule: "index-duplicate",
        remedy:
          "Remove the duplicate row(s) for this ADR in docs/adr/README.md — expected exactly one.",
      });
    }
  }

  const knownFiles = new Set(files);
  for (const target of indexCounts.keys()) {
    if (!knownFiles.has(target)) {
      violations.push({
        file: "README.md",
        rule: "index-orphaned",
        remedy: `Remove or fix the README.md row pointing to "${target}", which does not exist in docs/adr/.`,
      });
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────

export function validateAdrStructure(adrDir: string): StructuralViolation[] {
  const violations: StructuralViolation[] = [];
  const files = readdirSync(adrDir).filter((f) => f.endsWith(".md") && f !== "README.md");

  const idsByFile = new Map<string, string>();
  for (const file of files) {
    const content = readFileSync(join(adrDir, file), "utf8");
    const { id } = checkFrontmatter(file, content, violations);
    if (id) idsByFile.set(file, id);
  }

  checkUniqueAndSequentialIds(idsByFile, violations);
  checkIndexSync(adrDir, files, violations);

  return violations;
}
