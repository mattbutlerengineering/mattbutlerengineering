# AI Repo Benchmark — Seeded-Bug Capability Testing

## Purpose

Measures AI problem-solving capability on this specific codebase by injecting known bugs and timing the AI's ability to find and fix them. Unlike the onboarding benchmark (which measures navigation speed), this measures diagnostic and repair ability.

## Quick Start

```bash
node scripts/acmm/repo-bench.js --list                           # See available bugs
node scripts/acmm/repo-bench.js --seed missing-import            # Inject bug
# ... start fresh AI session, give it the task ...
node scripts/acmm/repo-bench.js --verify missing-import          # Check if fixed
node scripts/acmm/repo-bench.js --record missing-import 4 90     # Record: 4 turns, 90s
```

## Available Bugs

| ID | Difficulty | File | What It Tests |
|----|-----------|------|---------------|
| `missing-import` | Easy | `packages/config/eslint/base.js` | Can the AI identify and restore a missing import? |
| `wrong-status-code` | Easy | `services/users/src/routes/users.ts` | Can the AI spot a semantic bug (201→200) in a POST handler? |
| `type-narrowing` | Medium | `packages/api-client/src/client.ts` | Can the AI diagnose a null-guard removal from TypeScript errors? |

## Running a Benchmark

### 1. Seed a bug

```bash
node scripts/acmm/repo-bench.js --seed missing-import
```

The script:
- Creates a `.bench-backup` of the original file
- Injects the bug using a transform function
- Prints the task description to give the AI

### 2. Start a fresh AI session

Start a new Claude Code session (no prior context). Give the AI only the task description shown by the seed command. Time the session.

### 3. Verify the fix

```bash
node scripts/acmm/repo-bench.js --verify missing-import
```

Returns `FIXED ✓` or `NOT FIXED ✗` and restores the original file from backup.

### 4. Record the result

```bash
node scripts/acmm/repo-bench.js --record missing-import <turns> <seconds>
```

Results are appended to `.claude/acmm/repo-bench-results.json`.

## Interpreting Results

| Metric | Good | Warning | Investigate |
|--------|------|---------|-------------|
| Easy bug turns | ≤5 | 6-10 | >10 |
| Easy bug time | ≤2min | 2-5min | >5min |
| Medium bug turns | ≤10 | 11-20 | >20 |
| Medium bug time | ≤5min | 5-10min | >10min |

If results are worse than expected:
1. Check if the relevant `CLAUDE.md` or package docs are missing context
2. Add the missing information
3. Re-run the benchmark to verify improvement

## Comparing Models

Run the same bug with different models to measure capability differences:

```bash
# Seed, then test with Sonnet
node scripts/acmm/repo-bench.js --seed wrong-status-code
# Run in fresh session with claude-sonnet-4-6, record result

# Re-seed (verify restores the file), then test with Haiku
node scripts/acmm/repo-bench.js --seed wrong-status-code
# Run in fresh session with claude-haiku-4-5, record result
```

## Adding New Bugs

Add entries to the `SEEDED_BUGS` array in `scripts/acmm/repo-bench.js`:

```javascript
{
  id: 'your-bug-id',
  name: 'Human-readable name',
  difficulty: 'easy' | 'medium' | 'hard',
  description: 'Task description given to the AI',
  file: 'relative/path/to/file.ts',
  seed: (content) => /* return content with bug injected */,
  verify: (content) => /* return true if bug is fixed */,
},
```

Guidelines for good benchmark bugs:
- **Deterministic** — `seed()` and `verify()` must produce consistent results
- **Single-file** — keep it to one file so the AI doesn't need cross-file context
- **Realistic** — bugs should resemble real mistakes, not puzzles
- **Gradable** — `verify()` should have a clear pass/fail signal
