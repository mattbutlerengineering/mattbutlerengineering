/**
 * sentry-triage-dedup.mjs — decide whether to file a new GitHub issue for a
 * Sentry issue ID, or skip because a matching issue already exists.
 *
 * Why this module exists (#5553): `.claude/skills/sentry-triage/scripts/
 * triage.mjs` deduplicated by searching GitHub's Search API restricted to
 * `state:open`. Sentry issue `7734806348` was filed as a NEW GitHub issue
 * four times in five days (#5418, #5446, #5469, #5536) because every
 * earlier filing had already been closed by the time the next triage run
 * searched for it — `state:open` excluded exactly the issues that would
 * have caught the duplicate.
 *
 * This module keys on the Sentry issue ID PARSED OUT OF THE BODY'S URL
 * (`extractSentryIssueId`), never the title string. All four duplicate
 * issues above carry the identical title, so a title-string match would be
 * indistinguishable from a genuinely different error that happens to
 * render the same title template.
 *
 * Failure direction: fails CLOSED. `decideSentryDedup` treats
 * `existingIssues === null` — the caller could not complete the dedup
 * search (network failure, non-2xx response, or a REST 403 like the one
 * `.claude/improvement-loop/log.md` recorded four days running against the
 * `issues` sensor's gh-client REST fallback) — as an unconditional skip. A
 * dedup search that cannot run must never be treated as "no existing
 * issues found".
 */

const SENTRY_ISSUE_URL_RE = /sentry\.io\/organizations\/[^/]+\/issues\/(\d+)/;

/**
 * Parses the Sentry issue ID out of a GitHub issue body's
 * `**Sentry Issue:** https://sentry.io/organizations/<org>/issues/<id>/`
 * line. Returns `null` when the body carries no such URL.
 */
export function extractSentryIssueId(body) {
  if (typeof body !== "string") return null;
  const match = body.match(SENTRY_ISSUE_URL_RE);
  return match ? match[1] : null;
}

/**
 * Decides file-vs-skip for a candidate Sentry issue ID.
 *
 * @param {string} sentryIssueId - candidate Sentry issue ID to dedup against.
 * @param {Array<{number: number, state: string, body: string}> | null} existingIssues
 *   Existing GitHub issues already fetched by the dedup search, in any
 *   state, or `null` when the search itself could not run — see the
 *   fail-closed note above.
 * @returns {{ action: "file" | "skip", reason: string, matchedIssue?: number }}
 */
export function decideSentryDedup(sentryIssueId, existingIssues) {
  if (existingIssues === null) {
    return { action: "skip", reason: "search-unavailable" };
  }

  const match = existingIssues.find((issue) => extractSentryIssueId(issue.body) === sentryIssueId);
  if (!match) {
    return { action: "file", reason: "no-match" };
  }

  const isOpen = String(match.state).toUpperCase() === "OPEN";
  return {
    action: "skip",
    reason: isOpen ? "open-match" : "closed-match",
    matchedIssue: match.number,
  };
}
