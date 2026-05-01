# AI Onboarding Benchmark

## Purpose

Measure how quickly a fresh AI session can complete known tasks in this repo. Unlike file-presence detection, this benchmark measures actual AI readiness — can the AI navigate the codebase and produce working code efficiently?

## Running the Benchmark

### 1. List available tasks

```bash
node scripts/acmm/onboarding-bench.js --list
```

### 2. Run a task

Start a fresh AI session (new conversation, no prior context). Give the AI the task description and time how long it takes.

### 3. Record results

```bash
node scripts/acmm/onboarding-bench.js --record <task-id> <turns> <seconds>
```

## Benchmark Tasks

| ID | Difficulty | Expected Turns | Expected Time | What It Tests |
|----|-----------|---------------|--------------|---------------|
| health-endpoint | Easy | 5 | 2min | Basic service navigation |
| add-test | Easy | 8 | 3min | Test patterns, coverage |
| fix-type-error | Medium | 6 | 2.5min | TypeScript understanding |
| add-component | Medium | 15 | 5min | Design system conventions |
| cross-package-feature | Hard | 25 | 10min | Monorepo navigation, cross-package deps |

## Scoring

| Metric | Pass | Over |
|--------|------|------|
| Turns vs expected | <=1.0x | >1.0x |
| Time vs expected | <=1.0x | >1.0x |

## Results

Results are stored in `.claude/acmm/onboarding-results.json` and can be tracked over time to measure improvement as CLAUDE.md and project documentation evolve.

## Improving Scores

If a benchmark task takes too many turns:
1. Check if the relevant CLAUDE.md or package docs are missing information
2. Add the missing context
3. Re-run the benchmark to verify improvement
