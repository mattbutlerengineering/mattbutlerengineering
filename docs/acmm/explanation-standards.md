# AI Explanation Quality Standards

## Purpose

Define what makes a good agent-authored PR description, commit message, and issue comment. These standards help measure AI output quality beyond binary pass/fail.

## PR Description Rubric

Agent PRs must include:

| Section | Required | Description |
|---------|----------|-------------|
| Summary | Yes | 1-3 bullet points describing what changed and why |
| Test plan | Yes | How the change was verified (tests, manual, both) |
| Risk assessment | For complex changes | What could break, blast radius |
| Related issues | Yes | Links to the GitHub issue(s) being addressed |

### Scoring

| Score | Criteria |
|-------|----------|
| 3 (Excellent) | All sections present, reasoning is clear, trade-offs explained |
| 2 (Adequate) | Summary and test plan present, reasoning implied but not explicit |
| 1 (Minimal) | Only a summary, no test plan or reasoning |
| 0 (Missing) | No description or auto-generated boilerplate only |

## Commit Message Rubric

Follow Conventional Commits format. Quality criteria:

| Score | Criteria |
|-------|----------|
| 3 | Correct type, descriptive subject, body explains WHY |
| 2 | Correct type, descriptive subject, no body |
| 1 | Generic subject ("fix bug", "update file") |
| 0 | No message or meaningless message |

## Self-Correction Metrics

Track these per agent PR:

| Metric | Definition | Target |
|--------|------------|--------|
| First-attempt CI pass rate | PRs that pass CI on first push | >80% |
| Fix-up commit count | Additional commits after initial push | <2 per PR |
| Revert rate | PRs that get reverted within 7 days | <5% |

## Measurement

Metrics are derived from GitHub API data:
- PR descriptions: score manually or via LLM evaluation
- Self-correction: count commits per PR after initial push
- First-attempt: check if first CI run on the PR passed
