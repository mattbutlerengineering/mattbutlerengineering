import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function readFileSafe(filePath) {
  try {
    return existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  } catch {
    return "";
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: "", body: "" };
  const fmEnd = content.indexOf("---", 4);
  const body = content.slice(fmEnd + 3).trim();
  return { frontmatter: match[1], body };
}

function extractISODates(text) {
  return [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
}

function checkReflection(filePaths, _cwd) {
  for (const fp of filePaths) {
    const content = readFileSafe(fp);
    if (!content) continue;
    const { frontmatter, body } = parseFrontmatter(content);
    if (frontmatter.includes("feeds_back_into:") && body.length > 50) {
      return { passed: true, evidence: `has feeds_back_into + body ${body.length} chars` };
    }
  }
  return { passed: false, evidence: "missing feeds_back_into frontmatter or body too short" };
}

function checkSkill(filePaths, _cwd) {
  for (const fp of filePaths) {
    const content = readFileSafe(fp);
    if (!content) continue;
    const { body } = parseFrontmatter(content);
    const instructionContent = body
      .replace(/^#+\s+.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    if (instructionContent.length > 100) {
      return {
        passed: true,
        evidence: `${instructionContent.length} chars of instruction content`,
      };
    }
  }
  return { passed: false, evidence: "stub or insufficient instruction content (<100 chars)" };
}

function checkFeedbackLoop(filePaths, _cwd) {
  const now = Date.now();
  for (const fp of filePaths) {
    const content = readFileSafe(fp);
    if (!content.trim()) continue;
    const dates = extractISODates(content);
    for (const d of dates) {
      const ts = new Date(d).getTime();
      if (!isNaN(ts) && now - ts <= THIRTY_DAYS_MS) {
        return { passed: true, evidence: `recent entry dated ${d}` };
      }
    }
  }
  return { passed: false, evidence: "no entries from last 30 days" };
}

function checkTestCoverage(filePaths, _cwd) {
  for (const fp of filePaths) {
    const content = readFileSafe(fp);
    if (!content) continue;
    if (/(?:threshold|coverage|lines|branches|functions|statements)\s*[:=]\s*\d+/i.test(content)) {
      return { passed: true, evidence: "coverage threshold configured" };
    }
  }
  return { passed: false, evidence: "no recognizable coverage threshold" };
}

function expandToFiles(paths) {
  const result = [];
  for (const fp of paths) {
    try {
      if (existsSync(fp) && statSync(fp).isDirectory()) {
        const entries = readdirSync(fp, { recursive: true });
        for (const entry of entries) {
          result.push(join(fp, entry));
        }
      } else {
        result.push(fp);
      }
    } catch {
      result.push(fp);
    }
  }
  return result;
}

function checkRunbook(filePaths, _cwd) {
  const indicators = [
    /\/api\/v\d+\//,
    /(?:service|pod|container|deployment|instance)/i,
    /(?:grafana|datadog|sentry|prometheus|pagerduty|opsgenie)/i,
    /(?:kubectl|docker|doctl|wrangler|pulumi|terraform)/i,
    /(?:restart|rollback|scale|deploy|health)/i,
    /(?:endpoint|dashboard|alert|monitor)/i,
  ];

  for (const fp of expandToFiles(filePaths)) {
    const content = readFileSafe(fp);
    if (!content) continue;
    const matches = indicators.filter((re) => re.test(content));
    if (matches.length >= 2) {
      return { passed: true, evidence: `${matches.length} operational indicators found` };
    }
  }
  return { passed: false, evidence: "fewer than 2 operational indicators" };
}

export const substanceCheckers = {
  "acmm:correction-capture": checkReflection,
  "acmm:simple-skills": checkSkill,
  "acmm:feedback-loops": checkFeedbackLoop,
  "fullsend:test-coverage": checkTestCoverage,
  "fullsend:observability-runbook": checkRunbook,
};

export function runSubstanceChecks(detectedIds, criteria, cwd) {
  const results = {};

  for (const c of criteria) {
    if (!detectedIds.has(c.id)) continue;

    const checker = substanceCheckers[c.id];
    if (!checker) {
      results[c.id] = { substantive: null, substanceEvidence: null };
      continue;
    }

    const patterns = Array.isArray(c.detection.pattern)
      ? c.detection.pattern
      : [c.detection.pattern];
    const filePaths = patterns
      .map((p) => {
        const resolved = typeof p === "string" ? p : (p.file ?? "");
        return resolve(cwd, resolved);
      })
      .filter((p) => existsSync(p));

    if (filePaths.length === 0) {
      const dirPaths = patterns
        .map((p) => resolve(cwd, typeof p === "string" ? p : ""))
        .filter((p) => existsSync(p));

      const expanded = [];
      for (const dp of dirPaths) {
        try {
          const files = readdirSync(dp, { recursive: true });
          for (const f of files) {
            const full = join(dp, f);
            expanded.push(full);
          }
        } catch {
          // skip
        }
      }
      if (expanded.length > 0) {
        const result = checker(expanded, cwd);
        results[c.id] = { substantive: result.passed, substanceEvidence: result.evidence };
        continue;
      }

      results[c.id] = {
        substantive: false,
        substanceEvidence: "no files found for substance check",
      };
      continue;
    }

    const result = checker(filePaths, cwd);
    results[c.id] = { substantive: result.passed, substanceEvidence: result.evidence };
  }

  return results;
}
