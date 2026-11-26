/**
 * GitHub's closing-keyword parser ignores negation: "does not close #N" still
 * closes #N on merge (#5668, #9766). Pure detector used by auto-label.yml to
 * warn on PR bodies. Advisory only.
 */
const KEYWORD = /\b(clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed))\b\s*:?\s*#(\d+)/gi;
const NEGATION = /\b(?:not|never|without)\b|n't\b|\bno longer\b/i;

export function findNegatedClosingRefs(body) {
  if (typeof body !== "string" || body === "") return [];
  const text = body.replace(/```[\s\S]*?```/g, " ");
  const hits = [];
  for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
    const sentence = raw.trim();
    if (!sentence || !NEGATION.test(sentence)) continue;
    for (const m of sentence.matchAll(KEYWORD)) {
      hits.push({ keyword: m[1].toLowerCase(), issue: Number(m[2]), sentence });
    }
  }
  return hits;
}

/** CLI for auto-label.yml: reads PR_BODY, writes comment.md when there is a hit. */
export function buildComment(hits) {
  return [
    "<!-- negated-closing-refs -->",
    "GitHub ignores negation: these lines will still close the issue when this PR merges.",
    "",
    ...hits.map((h) => `- #${h.issue}: "${h.sentence}"`),
    "",
    "Reword to `Refs #N` or `issue N` (no closing keyword) if the issue must stay open.",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const hits = findNegatedClosingRefs(process.env.PR_BODY || "");
  if (hits.length) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync("comment.md", buildComment(hits));
  }
}
