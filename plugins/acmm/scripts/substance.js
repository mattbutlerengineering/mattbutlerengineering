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

/**
 * Newest frontmatter-declared date among the entries `qualifies` accepts, or null if none do.
 *
 * `qualifies` receives the parsed `{ frontmatter, body }` and is where each criterion states what
 * makes a file one of *its* entries — a corpus directory usually holds more than one kind.
 */
function newestQualifyingEntry(filePaths, qualifies) {
  let newest = null;
  for (const fp of filePaths) {
    const content = readFileSafe(fp);
    if (!content) continue;
    const parsed = parseFrontmatter(content);
    if (!qualifies(parsed)) continue;
    const dated = newestFrontmatterDate(parsed.frontmatter);
    if (dated && (!newest || dated.ts > newest.ts)) newest = dated;
  }
  return newest;
}

/**
 * Shared verdict for every recency checker.
 *
 * `absentEvidence` must never contain a date: a corpus that stopped on a knowable date and one
 * that was never written are different problems, and reporting them identically is what let a
 * criterion sit hollow without anyone knowing which one to fix.
 */
function recencyVerdict(newest, windowMs, absentEvidence) {
  if (!newest) return { passed: false, evidence: absentEvidence };
  const age = Date.now() - newest.ts;
  // Floor, not round: an entry dated today is 0 days old for the whole of today.
  const evidence = `newest entry ${newest.date} is ${Math.floor(age / DAY_MS)} days old`;
  if (age <= windowMs) return { passed: true, evidence };
  return { passed: false, evidence: `${evidence} (window: ${windowMs / DAY_MS} days)` };
}

/**
 * A row still on its italic template placeholder: `_Note 1_`, `- [ ] _Next step 1_`,
 * `1. _Approach 1: description and outcome_`, `- **Created:** _list of new files_`.
 */
const PLACEHOLDER_LINE = /^(?:[-*]\s*(?:\[[ xX]\]\s*)?|\d+\.\s*)?(?:\*\*[^*]*\*\*:?\s*)?_[^_]*_$/;

/**
 * What a session actually wrote: the text left once structure (headings, blockquotes, table rows,
 * rules) and every unfilled placeholder row are stripped. An untouched template reduces to "".
 */
function filledContent(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line === "---") return false;
      if (line.startsWith("#") || line.startsWith(">") || line.startsWith("|")) return false;
      return !PLACEHOLDER_LINE.test(line);
    })
    .join(" ")
    .trim();
}

/** The lines under any `## <heading>` in `headings`, up to the next `## `. */
function sectionBody(body, headings) {
  const wanted = new Set(headings.map((h) => h.toLowerCase()));
  const out = [];
  let inSection = false;
  for (const line of body.split("\n")) {
    const heading = line.match(/^##\s+(.*?)\s*$/);
    if (heading) {
      inSection = wanted.has(heading[1].toLowerCase());
      continue;
    }
    if (inSection) out.push(line);
  }
  return out.join("\n");
}

function checkReflection(filePaths, _cwd) {
  const newest = newestQualifyingEntry(
    filePaths,
    ({ frontmatter, body }) => frontmatter.includes("feeds_back_into:") && body.length > 50
  );
  return recencyVerdict(
    newest,
    NINETY_DAYS_MS,
    "no dated entry with feeds_back_into + body over 50 chars"
  );
}

/**
 * Substance for acmm:positive-reinforcement — how recently a *reinforcement* was captured.
 *
 * Detection is `.claude/memory/`, a directory holding two corpora with opposite jobs:
 * `corrections/` (what went wrong) and `reinforcements/` (what went right). Reading every file
 * under it would let a fresh correction satisfy the one criterion that exists to prove the repo
 * captures more than corrections — the same false reading #5613 fixed for feedback-loops, and a
 * live risk here because corrections are current while reinforcements have not grown since May.
 * `pattern:` is the discriminator: every reinforcement declares the transferable rule it is
 * preserving, and no correction in this corpus declares one (they carry `correction:` /
 * `feeds_back_into:` instead).
 *
 * 90 days, matching checkReflection rather than checkFeedbackLoop: reinforcement capture is
 * human-initiated at session end, so a quiet stretch of routine work legitimately produces none.
 * A 30-day window would cry wolf on an ordinary month and get muted.
 */
function checkReinforcement(filePaths, _cwd) {
  const newest = newestQualifyingEntry(filePaths, ({ frontmatter }) =>
    frontmatter.includes("pattern:")
  );
  return recencyVerdict(
    newest,
    NINETY_DAYS_MS,
    "no dated entry declaring a reinforcement pattern:"
  );
}

/**
 * Substance for acmm:session-summary — whether an end-of-session summary was actually written,
 * and how recently.
 *
 * Both halves matter. `.claude/session-summary.md` starts as a copy of
 * `.claude/session-summary.template.md`, so its existence proves nothing: it sat unfilled from
 * #910 to #5647 while the criterion read green off mere presence (#5598). `filledContent` strips
 * the structure and every row still on its `_placeholder_`, leaving only what a session wrote.
 *
 * Dates come from frontmatter, never the body — see newestFrontmatterDate. A summary's body is
 * full of ISO dates (commits, issues, "what changed"), and any one of them would re-date a stale
 * summary forever, which is precisely the fossil acmm:session-continuity's grep detection is.
 *
 * 90 days, not 30: writing a summary is human-initiated at session end, so a run of short sessions
 * legitimately produces none.
 */
function checkSessionSummary(filePaths, _cwd) {
  const newest = newestQualifyingEntry(filePaths, ({ body }) => filledContent(body).length > 100);
  return recencyVerdict(
    newest,
    NINETY_DAYS_MS,
    "no dated summary with content beyond the template's placeholders"
  );
}

/**
 * Substance for acmm:session-continuity — whether the persistent record carries forward context.
 *
 * Deliberately a different gate from checkSessionSummary, though detection resolves both to the
 * same file. This criterion's own rationale is that it "bridges the gap between what git/CI can
 * tell you (what was done) and what can't be derived (what was planned)", so a record that is
 * purely retrospective leaves the next session nothing to recover however recent it is. This
 * repo's committed scratchpad is exactly that shape: two real lines of retrospect with every
 * "Next steps" and "Continuity notes" row untouched.
 *
 * 90 days, for the same reason as checkSessionSummary: written by hand at session end, not by a
 * daily automation.
 */
function checkSessionContinuity(filePaths, _cwd) {
  const newest = newestQualifyingEntry(
    filePaths,
    ({ body }) => filledContent(sectionBody(body, ["Next steps", "Continuity notes"])).length > 0
  );
  return recencyVerdict(
    newest,
    NINETY_DAYS_MS,
    "no dated record with forward context under Next steps / Continuity notes"
  );
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

  return recencyVerdict(newest, THIRTY_DAYS_MS, "no dated entries in the loop log");
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
  "acmm:positive-reinforcement": checkReinforcement,
  "acmm:session-summary": checkSessionSummary,
  "acmm:session-continuity": checkSessionContinuity,
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
