# Override Analytics: Categorizing and Trending Human Corrections

## Purpose

When humans correct AI suggestions, the correction itself is valuable data. But a raw count of overrides tells you nothing about *why* the AI was wrong. Override analytics adds a taxonomy to human corrections so teams can distinguish "the AI was factually wrong" from "the AI was right but the user preferred a different style" and identify systemic weaknesses that instruction updates can fix.

## Current State

Claude Reflect captures corrections during sessions and can persist them to CLAUDE.md or memory files. However, corrections are stored as unstructured text with no categorization. This means:

- You can see *that* corrections happened, but not *why*
- Recurring patterns (e.g., "AI keeps using the wrong auth pattern") are invisible without manual review
- There is no way to prioritize which instruction gaps to fix first

This document adds the taxonomy and trending guidance needed to turn raw corrections into actionable improvement signals.

## Override Taxonomy

Every human correction of an AI suggestion falls into one of six categories:

| Category | Code | Description | Example |
|----------|------|-------------|---------|
| **Safety** | `S` | AI proposed something that could cause harm: security vulnerabilities, data exposure, destructive operations | "Don't use `git push --force` on main" |
| **Correctness** | `C` | AI was factually wrong: incorrect logic, wrong API usage, broken code | "That function returns a Promise, not a value" |
| **Style** | `T` | AI produced working code that violated project conventions or preferences | "We use `const` not `let` for immutable bindings" |
| **Scope** | `O` | AI did too much or too little: overreached beyond the task, or missed part of it | "I only asked you to fix the test, not refactor the module" |
| **Performance** | `P` | AI produced correct code with unacceptable performance characteristics | "Don't load all records into memory; use pagination" |
| **Misunderstanding** | `M` | AI misinterpreted the intent of the request | "I meant the login page, not the signup page" |

### Category Priority

When a correction spans multiple categories, assign the highest-priority category:

1. **Safety** (always takes precedence)
2. **Correctness**
3. **Performance**
4. **Scope**
5. **Misunderstanding**
6. **Style**

Rationale: safety and correctness failures indicate gaps that can cause real harm. Style disagreements, while frequent, are low-severity and often subjective.

## How Overrides Are Captured

Corrections enter the system through three channels:

### 1. Claude Reflect hooks

When a user corrects the AI mid-session ("no, do it this way"), the `/reflect` skill captures the correction and persists it to memory or CLAUDE.md. These are the highest-fidelity corrections because they include full context.

### 2. Tool rejections

When a user rejects a tool call (e.g., denying a file write or command execution), the rejection is an implicit correction. The rejection reason, if provided, categorizes the override.

### 3. PR review comments

When a reviewer requests changes on an AI-authored PR, each review comment is an override. Review comments are the most structured source because they attach to specific code locations.

## Categorization Decision Tree

Use this tree to assign a category to each correction:

```
1. Did the AI propose something that could cause security,
   data, or operational harm?
   YES → Safety (S)
   NO  → continue

2. Was the AI's output factually incorrect — wrong logic,
   wrong API, broken code?
   YES → Correctness (C)
   NO  → continue

3. Would the AI's output cause performance problems at
   production scale?
   YES → Performance (P)
   NO  → continue

4. Did the AI do too much or too little relative to what
   was asked?
   YES → Scope (O)
   NO  → continue

5. Did the AI misinterpret the user's intent — working on
   the wrong feature, file, or concept?
   YES → Misunderstanding (M)
   NO  → continue

6. Was the correction about conventions, naming, formatting,
   or stylistic preference?
   YES → Style (T)
   NO  → re-evaluate from step 1 with more context
```

## Trending

### Identifying Systemic Patterns

A single override is noise. Recurring overrides in the same category reveal systemic gaps. To trend overrides:

1. **Aggregate by category**: count overrides per category per week. A spike in one category signals an instruction gap.
2. **Aggregate by topic**: group overrides by the code area they relate to (auth, database, UI, testing). Repeated corrections in one area mean the AI lacks domain context there.
3. **Track resolution**: when an instruction update addresses an override pattern, mark the pattern as "addressed" and verify it stops recurring.

### Example Trend Analysis

| Week | Safety | Correctness | Style | Scope | Performance | Misunderstanding |
|------|--------|-------------|-------|-------|-------------|------------------|
| W1   | 0      | 3           | 5     | 1     | 0           | 2                |
| W2   | 1      | 4           | 3     | 2     | 1           | 1                |
| W3   | 0      | 1           | 4     | 0     | 0           | 0                |
| W4   | 0      | 1           | 2     | 1     | 0           | 0                |

Reading: W1-W2 shows a correctness spike. Investigation reveals the AI was using a deprecated API. Adding the deprecation notice to CLAUDE.md in W2 drops correctness overrides by W3.

### Action Thresholds

| Signal | Action |
|--------|--------|
| 3+ overrides in same category in one week | Investigate root cause |
| Safety override (any count) | Immediate instruction or hook update |
| Declining overrides after instruction update | Instruction is working; no action needed |
| Category stays high after instruction update | Instruction is insufficient; escalate to hook or deny rule |

## Example Overrides with Categories

### Example 1: Safety (S)

**Context**: AI attempted to run `rm -rf /tmp/build` without confirming the path.
**Correction**: "Never run destructive shell commands without explicit user confirmation."
**Category**: Safety
**Action**: Add to deny list in `.claude/settings.json`.

### Example 2: Correctness (C)

**Context**: AI used `prisma.user.findFirst()` where `prisma.user.findUnique()` was required (unique constraint).
**Correction**: "Use findUnique when querying by a unique field."
**Category**: Correctness
**Action**: Add to CLAUDE.md under Prisma conventions.

### Example 3: Style (T)

**Context**: AI used `interface` for a type that should have been a `type` alias per project convention.
**Correction**: "We use `type` for union/intersection types and `interface` for object shapes with methods."
**Category**: Style
**Action**: Add to `.claude/rules/typescript/index.md`.

### Example 4: Scope (O)

**Context**: User asked to fix a failing test. AI fixed the test and also refactored the module under test.
**Correction**: "I only asked you to fix the test. Don't refactor unrelated code."
**Category**: Scope
**Action**: Reinforce "do what was asked, nothing more" in CLAUDE.md.

### Example 5: Performance (P)

**Context**: AI loaded all database records into memory to filter them in JavaScript.
**Correction**: "Filter in the database query, not in application code."
**Category**: Performance
**Action**: Add to CLAUDE.md under database query patterns.

### Example 6: Misunderstanding (M)

**Context**: User said "update the header" meaning the HTTP response header. AI updated the page header component.
**Correction**: "I meant the HTTP header, not the UI header."
**Category**: Misunderstanding
**Action**: No systemic fix needed; ambiguity was in the prompt.

## Integration with Existing Systems

- **Claude Reflect** (`/reflect`): Tag each reflection entry with a category code from the taxonomy above
- **Knowledge base** (`knowledge.jsonl`): Include the category when persisting a correction as a knowledge entry
- **ACMM audit** (`/acmm-audit`): The `acmm:override-analytics` criterion checks for the existence of this taxonomy document
- **Progress tracker** (`/progress-tracker`): Override category counts can feed into the weekly trend report
