/**
 * Every claude-reflect criterion was a pure duplicate of an existing `acmm`
 * criterion pointed at the same file — correction-capture, positive-
 * reinforcement, session-summary, and claude-md-sync all resolved to detection
 * identical to their acmm: counterpart under a different id; reflection-review
 * duplicated acmm:periodic-reflection; preference-index duplicated the dead
 * acmm:preference-index target (.claude/preferences.json has no reader).
 * Collapsed by #5851/#5853 (item 6, "Twins") — see
 * plugins/acmm/scripts/sources/upstream-parity.js's DROPPED_UPSTREAM_IDS
 * for the id-by-id reasons. The source stays registered (for attribution/
 * citation) with an empty catalog rather than being deleted outright.
 */
const CRITERIA = [];

export const claudeReflectSource = {
  id: "claude-reflect",
  name: "Claude Reflect",
  url: "https://github.com/BayramAnnakov/claude-reflect",
  citation:
    "Claude Reflect: A self-learning system for Claude Code that captures corrections and syncs them to CLAUDE.md. github.com/BayramAnnakov/claude-reflect",
  definesLevels: false,
  criteria: CRITERIA,
};
