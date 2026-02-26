# RFC Process

Request for Comments — how major architectural changes to Rialto are proposed, discussed, and decided.

---

## When to Write an RFC

An RFC is required for changes that:

- Add or remove a design token tier
- Change the token naming convention
- Modify the component authoring contract (forwardRef, CSS Modules, etc.)
- Introduce a new dependency (Framer Motion was an RFC-level decision)
- Change the build or packaging strategy
- Deprecate or remove a component

An RFC is **not** needed for:

- Adding a new component (use the [Contribution Lifecycle](./CONTRIBUTION.md))
- Bug fixes or minor API additions
- Documentation updates

---

## Template

Copy the sections below into a new file at `docs/rfcs/YYYY-MM-DD-short-title.md`.

```markdown
# RFC: [Title]

**Author:** [Name]
**Date:** [YYYY-MM-DD]
**Status:** Draft | Under Review | Accepted | Rejected | Superseded

## Problem Statement

What problem does this solve? Why can't we do this with the current system?

## Proposed Solution

Describe the change in enough detail that someone could implement it.

## Alternatives Considered

What other approaches were evaluated? Why were they rejected?

## Breaking Changes

List every breaking change. For each one:

- What breaks
- Who is affected
- Migration path

## Migration Plan

Step-by-step guide for consumers to adopt the change.

## Open Questions

Unresolved decisions that need input during review.
```

---

## Lifecycle

| Status       | Meaning                                       |
| ------------ | --------------------------------------------- |
| Draft        | Author is still writing; not ready for review |
| Under Review | Open for comments; minimum 5 business days    |
| Accepted     | Approved for implementation                   |
| Rejected     | Not moving forward; rationale documented      |
| Superseded   | Replaced by a newer RFC (link to replacement) |

---

## Review Rules

1. RFCs are reviewed in the `docs/rfcs/` directory via pull request.
2. Any team member can comment. The core team makes the final decision.
3. Minimum review period: 5 business days from when status moves to "Under Review."
4. The author updates the RFC based on feedback, then the core team sets the final status.
