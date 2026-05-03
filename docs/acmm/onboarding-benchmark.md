# Onboarding Benchmark

Measures how effectively this repository's instruction files, code patterns, and documentation teach new AI agent sessions to be productive.

## Concept: Codebase as Model

The ACMM paper (arXiv:2604.09388v2, Section 2.4) introduces the idea that accumulated code patterns, instruction files (CLAUDE.md, AGENTS.md), and test suites collectively _teach_ AI agents how to operate -- the "codebase as model" concept. A mature repo should onboard new sessions faster than an immature one.

## Methodology

Five tasks of increasing difficulty, each measuring a different aspect of codebase understanding:

| Task                         | Difficulty | Expected Time | What It Measures                   |
| ---------------------------- | ---------- | ------------- | ---------------------------------- |
| Add a TODO to CLAUDE.md      | Trivial    | ~1 min        | File access, instruction awareness |
| Run tests and report results | Easy       | ~3 min        | Repo navigation, toolchain         |
| Fix lint errors in a file    | Medium     | ~5 min        | Tool configuration knowledge       |
| Add a new API endpoint       | Hard       | ~15 min       | Pattern recognition, architecture  |
| Cross-service feature        | Expert     | ~30 min       | Multi-service understanding        |

## Running

```bash
# See task descriptions
node plugins/acmm/scripts/onboarding-benchmark.js

# Record a result
node plugins/acmm/scripts/onboarding-benchmark.js --record <task-id> --minutes <N> [--success]
```

Results are stored in `.claude/acmm/onboarding-benchmark.json` (gitignored -- local per-environment).

## Interpreting Results

- **Ratio < 1.0**: Agent completed faster than expected -- strong codebase-as-model signal
- **Ratio 1.0-2.0**: Normal range -- instructions are adequate
- **Ratio > 2.0**: Agent struggled -- instruction files may need improvement
- **Failure**: Agent could not complete -- significant gap in documentation or patterns

## Improving Scores

If a benchmark task takes too long:

1. **Identify the bottleneck** -- which step did the AI get stuck on? Was it finding the right file, understanding the pattern, or getting the build to pass?
2. **Add missing context** -- update the relevant CLAUDE.md or package docs with the information the AI was missing
3. **Re-run** -- verify the improvement with a fresh session

### Common documentation fixes

| Symptom                            | Fix                                                |
| ---------------------------------- | -------------------------------------------------- |
| AI cannot find the right directory | Add file structure to package CLAUDE.md            |
| AI uses wrong patterns             | Add code examples to CLAUDE.md conventions section |
| AI misses a required step          | Add to the package's build/test commands section   |
| AI creates wrong file structure    | Add component authoring pattern                    |

## Difference from Repo Benchmark

|            | Onboarding Benchmark      | Repo Benchmark              |
| ---------- | ------------------------- | --------------------------- |
| Measures   | Navigation + doc quality  | Diagnostic + repair ability |
| Task type  | Build something new       | Fix a known bug             |
| Script     | `onboarding-benchmark.js` | `repo-bench.js`             |
| Key metric | Time to completion        | Fix success rate            |

## Baseline

_No baseline established yet. Run the benchmark to establish initial measurements._
