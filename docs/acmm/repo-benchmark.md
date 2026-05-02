# AI Repo Benchmark — Seeded-Bug Capability Testing

## Purpose

Measures AI problem-solving capability on this specific codebase by injecting known bugs and timing the AI's ability to find and fix them. Unlike the onboarding benchmark (which measures navigation speed), this measures diagnostic and repair ability.

## Running a Benchmark

### 1. List available bugs
```bash
node scripts/acmm/repo-bench.js --list
```

### 2. Seed a bug
```bash
node scripts/acmm/repo-bench.js --seed missing-import
```

### 3. Ask the AI to fix it
Start a fresh AI session and give it the task description shown by the seed command.

### 4. Verify and record
```bash
node scripts/acmm/repo-bench.js --verify missing-import
node scripts/acmm/repo-bench.js --record missing-import <turns> <seconds>
```

## Available Bugs

| ID | Difficulty | Description |
|----|-----------|-------------|
| missing-import | Easy | Removed import statement |
| wrong-status-code | Easy | Incorrect HTTP status code in POST handler |
| type-narrowing | Medium | Missing null check required by strict TypeScript |

## Results

Results are stored in `.claude/acmm/repo-bench-results.json` and tracked over time.

## Adding New Bugs

Add entries to the `SEEDED_BUGS` array in `scripts/acmm/repo-bench.js`. Each bug needs:
- `seed(content)` — function that injects the bug
- `verify(content)` — function that returns true when the bug is fixed
