# AI Explanation Quality Standards

## Purpose

Define what makes a good agent-authored PR description, commit message, and issue comment. These standards help measure AI output quality beyond binary pass/fail — a PR that passes CI but has no reasoning is harder to review and maintain.

## PR Description Rubric

Agent PRs must include:

| Section         | Required            | Description                                       |
| --------------- | ------------------- | ------------------------------------------------- |
| Summary         | Yes                 | 1-3 bullet points describing what changed and why |
| Test plan       | Yes                 | How the change was verified (tests, manual, both) |
| Risk assessment | For complex changes | What could break, blast radius                    |
| Related issues  | Yes                 | Links to the GitHub issue(s) being addressed      |

### Scoring

| Score         | Criteria                                                    | Example                                                                                                                            |
| ------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 3 (Excellent) | All sections present, reasoning clear, trade-offs explained | "Chose execFileSync over execSync to avoid shell injection. Trade-off: can't use shell pipes, but these commands don't need them." |
| 2 (Adequate)  | Summary and test plan present, reasoning implied            | "Switched to execFileSync for security. Added 6 tests."                                                                            |
| 1 (Minimal)   | Only a summary, no test plan or reasoning                   | "Fixed the security issue."                                                                                                        |
| 0 (Missing)   | No description or auto-generated boilerplate only           | —                                                                                                                                  |

### Good vs bad PR descriptions

**Good:** Explains the WHY, names alternatives considered, states what was tested

```markdown
## Summary

- Validate repository and username params before constructing GitHub API URL
- Prevents SSRF via crafted webhook payloads that redirect fetch() to arbitrary hosts

## Test plan

- 6 new tests: path traversal, query injection, URL scheme injection, encoded chars
- Positive case: valid repo/username with hyphens and dots
```

**Bad:** Describes WHAT but not WHY, no test plan

```markdown
Added validation to webhooks.ts
```

## Commit Message Rubric

Follow Conventional Commits format (`type(scope): description`).

| Score | Criteria                                             | Example                                                                 |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| 3     | Correct type, descriptive subject, body explains WHY | `fix(security): validate repo param to prevent SSRF in webhook handler` |
| 2     | Correct type, descriptive subject, no body           | `fix(security): add input validation to webhooks`                       |
| 1     | Generic subject                                      | `fix: update file`                                                      |
| 0     | No message or meaningless                            | `wip`                                                                   |

### Commit type reference

| Type       | When               | Example                                                        |
| ---------- | ------------------ | -------------------------------------------------------------- |
| `feat`     | New capability     | `feat(acmm): add onboarding benchmark script`                  |
| `fix`      | Bug fix            | `fix(security): prevent command injection in worktree-manager` |
| `docs`     | Documentation only | `docs(acmm): expand cost governance guide`                     |
| `refactor` | No behavior change | `refactor(api-client): extract retry logic to shared util`     |
| `test`     | Tests only         | `test(auth): add token refresh edge cases`                     |
| `chore`    | Maintenance        | `chore: update pnpm lockfile`                                  |

## Self-Correction Metrics

Track these per agent PR to measure output quality over time:

| Metric                     | Definition                            | Target    | How to Measure                       |
| -------------------------- | ------------------------------------- | --------- | ------------------------------------ |
| First-attempt CI pass rate | PRs that pass CI on first push        | >80%      | `gh pr checks <num>` on first commit |
| Fix-up commit count        | Additional commits after initial push | <2 per PR | Count commits on PR after creation   |
| Revert rate                | PRs reverted within 7 days            | <5%       | Search for `agent-regression` label  |

### Interpreting self-correction trends

| Trend                       | Signal                                   | Action                                                               |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| First-attempt rate dropping | Agent is pushing broken code more often  | Check if CLAUDE.md has stale patterns or if tests changed            |
| Fix-up count rising         | Agent needs multiple attempts to pass CI | Check for flaky tests or new lint rules the agent doesn't know about |
| Revert rate rising          | Agent is causing production issues       | Review auto-rollback logs, tighten pre-merge checks                  |

## Measurement

Metrics are derived from GitHub API data:

```bash
# PR description score: manual review or LLM evaluation
gh pr view <num> --json body --jq '.body'

# Self-correction: count commits after initial push
gh pr view <num> --json commits --jq '.commits | length'

# First-attempt CI: check if first workflow run passed
gh run list --branch <branch> --limit 1 --json conclusion --jq '.[0].conclusion'

# Revert rate: count agent-regression PRs in last 30 days
gh pr list --state all --label agent-regression --json number --jq 'length'
```

## Integration with Progress Tracker

The `/progress-tracker` skill reports these metrics alongside issue/PR counts. See [ai-health-monitoring.md](ai-health-monitoring.md) for the full metrics architecture.
