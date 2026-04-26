---
date: 2026-04-25
session: ACMM improvement loop iteration 4
tags: [acmm, iteration-rhythm, batching]
feeds_back_into: [docs/acmm.md, .claude/skills/acmm-audit/SKILL.md]
---

# Batch multiple honest gap-closures in one iteration when they cluster behind a single threshold

**Context:** Three iterations of the loop established a "one tooling +
one honest gap closure per iteration" rhythm. Iteration 4 broke that
pattern: shipped 4 honest L6 artifacts in one iteration to cross the
70% threshold and promote L5 → L6. Initially I felt the rule violation;
in retrospect the batching was correct.

**What I learned:** The "one per iteration" guideline isn't about pacing
for its own sake — it's about coherence and verifiability. Each iteration
should be reviewable as a single unit of progress. When 4 gaps each
require a small, well-bounded artifact AND they all sit behind a single
level threshold (so closing 3 of them produces no observable system
change), batching them is more coherent, not less. The level promotion
is the iteration's headline; the 4 artifacts are the implementation.

The honesty bar still holds: each artifact must have real content that
satisfies the criterion's underlying need, not just touch a file path.
What changes is the unit of work, not the standard.

The anti-pattern to watch: batching sub-threshold gaps that DON'T
cluster — closing one L6 + one L5 + one L4 in the same iteration is
still incoherent because nothing observable shifts.

**Action taken:** Updated `docs/acmm.md` "How we improve over time"
section to note that the "one per iteration" rhythm is a default, not a
rule — when N small honest gaps all sit behind a single threshold,
batching them is correct.
