import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

/**
 * Recency window for correction capture — deliberately wider than checkFeedbackLoop's 30 days.
 *
 * That checker guards an *automated* daily log, where a 30-day silence means ~30 missed runs and
 * is unambiguously broken. Correction capture is *human-initiated* at the end of a session, so the
 * corpus legitimately goes quiet through stretches of routine work where nobody was corrected. A
 * 30-day window here would go red during an ordinary quiet month, and a check that cries wolf on
 * healthy behaviour gets muted — which is the exact failure this criterion exists to detect.
 *
 * 90 days is one quarter: three of this repo's monthly review cycles would each have to pass
 * without a single correction captured before it fires. Below that it is noise; above it, a dead
 * loop keeps reading as a live one (the corpus sat frozen for four months before anyone noticed).
 */
const NINETY_DAYS_MS = 90 * DAY_MS;

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

/**
 * Newest ISO date declared in an entry's frontmatter, or null if it declares none.
 *
 * Frontmatter-only on purpose. Correction files carry `date:` for when the correction happened,
 * but their *bodies* accumulate "## Verification <date>" notes from periodic reviews. Reading
 * dates from the body would let a review of a four-month-old entry count as a fresh capture —
 * re-reading an old lesson is not capturing a new one, and two files in this repo's own corpus
 * carry such a note dated within the window while the corpus itself has not grown since May.
 */
function newestFrontmatterDate(frontmatter) {
  let newest = null;
  for (const d of extractISODates(frontmatter)) {
    const ts = new Date(d).getTime();
    if (isNaN(ts)) continue;
    if (!newest || ts > newest.ts) newest = { date: d, ts };
  }
  return newest;
}

function checkReflection(filePaths, _cwd) {
  let newest = null;
  for (const fp of filePaths) {
    const content = readFileSafe(fp);
    if (!content) continue;
    const { frontmatter, body } = parseFrontmatter(content);
    if (!frontmatter.includes("feeds_back_into:") || body.length <= 50) continue;
    const dated = newestFrontmatterDate(frontmatter);
    if (dated && (!newest || dated.ts > newest.ts)) newest = dated;
  }

  if (!newest) {
    return {
      passed: false,
      evidence: "no dated entry with feeds_back_into + body over 50 chars",
    };
  }

  const age = Date.now() - newest.ts;
  // Floor, not round: an entry dated today is 0 days old for the whole of today.
  const evidence = `newest entry ${newest.date} is ${Math.floor(age / DAY_MS)} days old`;
  if (age <= NINETY_DAYS_MS) return { passed: true, evidence };
  return { passed: false, evidence: `${evidence} (window: ${NINETY_DAYS_MS / DAY_MS} days)` };
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

/**
 * Substance for acmm:feedback-loops — how recently the autonomous-loop record was written to.
 *
 * Reads the dated, append-only loop log (`.claude/improvement-loop/`), NOT an instruction file
 * that merely describes the loop. Pointing this at `CLAUDE.md` made it a false negative: the only
 * ISO dates in that file are the four promoted corrections it lists as examples, so the check was
 * incidentally re-measuring correction-capture freshness while a loop writing an entry every day
 * was reported dead (#5613).
 *
 * The 30-day window stays — see NINETY_DAYS_MS above for why this checker is the stricter of the
 * two. Failure evidence distinguishes "no dated entry at all" (never wired up, or an empty log)
 * from "newest entry is N days old" (the loop ran and then stopped, on a knowable date); a dead
 * loop and an absent one are different problems and must not read identically.
 */
function checkFeedbackLoop(filePaths, _cwd) {
  let newest = null;
  for (const fp of filePaths) {
    const content = readFileSafe(fp);
    if (!content.trim()) continue;
    for (const d of extractISODates(content)) {
      const ts = new Date(d).getTime();
      if (isNaN(ts)) continue;
      if (!newest || ts > newest.ts) newest = { date: d, ts };
    }
  }

  if (!newest) return { passed: false, evidence: "no dated entries in the loop log" };

  const age = Date.now() - newest.ts;
  // Floor, not round: an entry dated today is 0 days old for the whole of today.
  const evidence = `newest entry ${newest.date} is ${Math.floor(age / DAY_MS)} days old`;
  if (age <= THIRTY_DAYS_MS) return { passed: true, evidence };
  return { passed: false, evidence: `${evidence} (window: ${THIRTY_DAYS_MS / DAY_MS} days)` };
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
    const resolvedPaths = patterns
      .map((p) => {
        const resolved = typeof p === "string" ? p : (p.file ?? "");
        return resolve(cwd, resolved);
      })
      .filter((p) => existsSync(p));

    if (resolvedPaths.length === 0) {
      results[c.id] = {
        substantive: false,
        substanceEvidence: "no files found for substance check",
      };
      continue;
    }

    const filePaths = [];
    for (const p of resolvedPaths) {
      let stat;
      try {
        stat = statSync(p);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        try {
          const entries = readdirSync(p, { recursive: true });
          for (const entry of entries) {
            const full = join(p, String(entry));
            try {
              if (statSync(full).isFile()) filePaths.push(full);
            } catch {
              // skip
            }
          }
        } catch {
          // skip unreadable dirs
        }
      } else {
        filePaths.push(p);
      }
    }

    if (filePaths.length === 0) {
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
