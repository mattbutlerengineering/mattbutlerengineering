# Ship Loop Learnings

Ongoing notes on improving the autonomous ship-loop process.

## 2026-03-29 — Harness Design Best Practices

_Source: [Anthropic Engineering — Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)_

### Key insight: Self-evaluation bias

Models strongly tend to approve their own output. A generator agent that also evaluates its own PR will nearly always pass it. The fix is a separate evaluator agent with a skeptical prompt, running after the generator completes.

### Key insight: Garbage in, garbage out

Passing only an issue title to a worktree agent leaves too much ambiguity. The agent has to guess at acceptance criteria, scope, and affected files. An upfront planner step that expands the issue into a structured spec dramatically improves first-iteration quality — and failures become more actionable when they reference concrete criteria.

### Key insight: Stateless retries waste budget

When an agent fails and the next agent starts from scratch, effort is duplicated. A structured failure handoff (what was attempted, what succeeded, what failed, suggested next step) lets the next agent or human pick up efficiently.

### Changes applied (closes #46)

| Phase        | Change                                                                   | Priority |
| ------------ | ------------------------------------------------------------------------ | -------- |
| B0 (new)     | Issue enrichment — planner expands issue to spec before agent launch     | P1       |
| B2 (new)     | Evaluator phase — separate skeptical agent reviews PR diff vs criteria   | P0       |
| B3 (updated) | Structured failure handoffs — agent-failed comments include full context | P2       |

### Future improvements to consider

- Upgrade smoke tests to Playwright `@smoke` tag for faster, more reliable verification
- Per-issue cost tracking (log `--max-budget` vs actual spend from agent run output)
- Model selection per phase: Haiku for planner/evaluator (cheap), Sonnet for generator (capable)
