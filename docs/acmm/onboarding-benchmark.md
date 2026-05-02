# AI Onboarding Benchmark

## Purpose

Measure how quickly a fresh AI session can complete known tasks in this repo. Unlike file-presence detection, this benchmark measures actual AI readiness — can the AI navigate the codebase and produce working code efficiently?

Improvements to CLAUDE.md, package docs, and `llms.txt` files should reduce benchmark times. This is the feedback signal for documentation quality.

## Quick Start

```bash
node scripts/acmm/onboarding-bench.js --list                       # See tasks
node scripts/acmm/onboarding-bench.js --record add-test 6 150      # Record: 6 turns, 150s
```

## Benchmark Tasks

| ID | Difficulty | Expected Turns | Expected Time | What It Tests |
|----|-----------|---------------|--------------|---------------|
| `health-endpoint` | Easy | 5 | 2min | Service navigation, Fastify patterns |
| `add-test` | Easy | 8 | 3min | Test framework, coverage patterns |
| `fix-type-error` | Medium | 6 | 2.5min | TypeScript strict mode, `noUncheckedIndexedAccess` |
| `add-component` | Medium | 15 | 5min | Rialto design system, CSS Modules, forwardRef |
| `cross-package-feature` | Hard | 25 | 10min | Monorepo navigation, cross-package typing, API client |

## Running a Benchmark

### 1. Start fresh
Open a **new** AI session — no prior context. The benchmark measures cold-start performance.

### 2. Give the task
Provide only the task description (from `--list`) and the target package. Don't give hints about file structure or patterns.

### 3. Time it
Count conversation turns and elapsed seconds from first prompt to working code.

### 4. Record
```bash
node scripts/acmm/onboarding-bench.js --record <task-id> <turns> <seconds>
```

Results append to `.claude/acmm/onboarding-results.json`.

## Scoring

| Metric | Pass (≤1.0x) | Marginal (1.0-1.5x) | Over (>1.5x) |
|--------|-------------|---------------------|--------------|
| Turns vs expected | On target | Slight overhead | Docs gap likely |
| Time vs expected | On target | Slight overhead | Navigation issue |

### Interpreting results

- **High turns, low time** → AI is exploring efficiently but the task needs more context in docs
- **Low turns, high time** → AI found the right approach but execution is slow (complex build, large files)
- **Both high** → Significant documentation gap — the AI can't find what it needs

## Improving Scores

If a benchmark task takes too many turns:

1. **Identify the bottleneck** — which turn did the AI get stuck? Was it finding the right file, understanding the pattern, or getting the build to pass?
2. **Add missing context** — update the relevant `CLAUDE.md` or package docs with the information the AI was missing
3. **Re-run** — verify the improvement with a fresh session

### Common documentation fixes

| Symptom | Fix |
|---------|-----|
| AI can't find the right directory | Add file structure to package CLAUDE.md |
| AI uses wrong patterns | Add code examples to CLAUDE.md conventions section |
| AI misses a required step | Add to the package's build/test commands section |
| AI creates wrong file structure | Add component authoring pattern (see Rialto CLAUDE.md) |

## Comparing Over Time

Run the same task monthly to track improvement:

```bash
# View all recorded results
cat .claude/acmm/onboarding-results.json | python3 -m json.tool
```

Plot `turnsVsExpected` and `timeVsExpected` over time — both should trend toward 1.0 as documentation improves.

## Difference from Repo Benchmark

| | Onboarding Benchmark | Repo Benchmark |
|---|---|---|
| Measures | Navigation + doc quality | Diagnostic + repair ability |
| Task type | Build something new | Fix a known bug |
| Script | `onboarding-bench.js` | `repo-bench.js` |
| Key metric | Turns to completion | Fix success rate |
