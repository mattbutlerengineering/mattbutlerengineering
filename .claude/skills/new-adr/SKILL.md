---
name: new-adr
description: Scaffold a new Architecture Decision Record in docs/adr/ with the repo's canonical format and the next available sequential number
disable-model-invocation: true
---

# /new-adr — create an Architecture Decision Record

Scaffolds a new ADR in `docs/adr/` following the format enforced by `scripts/check-adr.js` (run by the pre-commit hook).

## Steps

1. **Find the next ADR number.** List `docs/adr/ADR-*.md`, parse the highest `ADR-NNN-` prefix, increment by 1. Note: multiple ADRs can share a number if they were filed on the same topic day (e.g., ADR-002 appears twice — that's fine), so also check for duplicates at the next number and append a `-b` suffix if needed.

2. **Ask the user two things if not supplied as args:**
   - Short kebab-case title (e.g., `switch-state-preservation`)
   - One-sentence summary of the decision

3. **Create `docs/adr/ADR-NNN-<title>.md`** using the template below. Populate the frontmatter and all four sections.

4. **Add an entry to `docs/adr/README.md`** in the index table, in numeric order.

5. **Confirm the file path** and remind the user that the pre-commit hook will validate the ADR format on commit.

## Template

```markdown
---
id: ADR-NNN
title: <Full Title>
status: active
date: YYYY-MM-DD
---

# ADR-NNN: <Full Title>

## Context

<What problem are we solving? What forces are at play? Cite any prior
ADRs this relates to. 2-5 sentences.>

## Decision

<What did we decide? State it plainly in 1-2 sentences. If there's a
rule or invariant, write it as a rule.>

## Consequences

<What are the trade-offs? What gets easier, what gets harder? Include
both positive and negative consequences. 3-6 bullet points.>

## Alternatives Considered

<What else did we evaluate? Why didn't we pick them? 2-4 alternatives,
one paragraph each. Skip obviously-bad options.>
```

## Rules

- Status defaults to `active`. Use `superseded` only when replacing an older ADR (also update the older one's status).
- Date is today's date in ISO format (YYYY-MM-DD).
- Title in the frontmatter and heading must match exactly.
- Do NOT include implementation details — ADRs are for decisions, not how-to guides.
- Keep each section under 200 words. ADRs are scan-and-go documents.
- If the decision introduces a prohibited pattern (like ADR-001's Tailwind ban), add a `prohibited_patterns:` array to the frontmatter — an array of regex strings that `check-adr` will grep against staged files.

## When to use

Create an ADR when:
- Choosing between multiple credible architectural options (database, framework, protocol)
- Establishing a new coding convention that affects multiple packages
- Deprecating or superseding a prior decision
- A decision would otherwise be buried in a commit message where nobody will find it

Do NOT use for:
- Routine implementation choices inside a single file
- Tactical bug fixes
- Feature additions that follow existing patterns
