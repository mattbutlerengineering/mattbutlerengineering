# Reflections

A committed log where AI sessions (and humans) record lessons learned that should
shape future work. Each reflection is one file named `YYYY-MM-DD-slug.md`.

## When to add one

- A correction or insight that would have saved time if known earlier.
- A pattern that worked and should be repeated.
- A surprise from running code vs. reading code (live output beat hand-summary).
- A lifecycle gap noticed in an existing tool or process.

## Format

```markdown
---
date: YYYY-MM-DD
session: <brief context — e.g. "ACMM improvement loop iteration 2">
tags: [ tag1, tag2 ]
feeds_back_into: [ path/to/instruction-file.md, ... ]
---

# <one-line lesson>

**Context:** what was happening when this came up.

**What I learned:** the actual insight, in 2-4 sentences.

**Action taken:** what changed in the codebase or instructions because of this.
```

## Why this exists

ACMM L5 (`acmm:reflection-log`) requires a committed reflection log so AI
sessions start smarter than the last one. Reflections that don't feed back into
an instruction file (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/*`, etc.) are
just diary entries — keep the `feeds_back_into` field honest.
