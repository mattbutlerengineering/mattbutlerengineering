# PR Review Criteria

The committed rubric Claude reviewers (and humans) follow when evaluating a pull request in this monorepo.

> **Why this exists.** ACMM L3 ("Measured / Enforced") gates on a written-down rubric: "the quality criteria for _is this PR ok_ are now in source control, not in someone's head." This file is that rubric. It's referenced by:
>
> - `pr-review-toolkit` plugin → `code-reviewer` agent
> - `.claude/agents/adr-compliance-reviewer.md`
> - `.claude/agents/migration-reviewer.md`
> - `claude-code-review` workflow (when re-enabled)
>
> The rubric is intentionally short. Long checklists rot; short rubrics get followed.

## Reviewer's job, in one sentence

**Find the issues that would cost real time if they shipped — bugs, security vulnerabilities, ADR violations, broken contracts — and ignore the rest.**

Style nits (`prettier`, `eslint`) are already enforced by the pre-commit hook. Don't re-litigate them in review.

## Tier 1 — must flag (block on these)

These warrant a `request changes` review. If you find one, name it specifically and quote the line.

1. **Bugs and broken behavior** — Logic errors, off-by-one, mutation where immutability is expected, async/await footguns, wrong type narrowing, dead conditionals.
2. **Security** — Hardcoded secrets, SQL injection vectors, unvalidated user input crossing a trust boundary, missing authorization checks, XSS-prone JSX, runtime evaluation of attacker-controlled strings.
3. **ADR violations** — A change that contradicts an active ADR in `docs/adr/`. The `adr-compliance-reviewer` agent goes beyond the regex `scripts/check-adr.js` enforces — flag _semantic_ violations (e.g., introducing `fetch` directly when an ADR mandates `@mbe/api-client`).
4. **Destructive or scope-creeping migrations** — A Prisma migration that drops columns/tables, renames without backfill, or whose SQL doesn't match the accompanying code change. Use `migration-reviewer` agent and check `scripts/check-destructive-migrations.js`.
5. **Silent failures** — `try { ... } catch {}`, default-fallback values that mask errors, retry loops without a circuit breaker, "graceful degradation" that hides legitimate breakage.
6. **Broken contracts** — Public API shape changes without a version bump, breaking changes to `@mattbutlerengineering/rialto` exports without a changeset, missing entry in `packages/*/CHANGELOG.md` for a versioned package.

## Tier 2 — should flag (comment, don't block)

Worth raising as `comment` review unless they cluster.

1. **Test gaps** — A new branch in business logic with no test exercising it. New `if`s that change behavior need at least one new assertion.
2. **Type weakness** — `any`, `as unknown as X`, `// @ts-expect-error` without a comment explaining why.
3. **Convention drift** — Pattern that contradicts neighboring code in the same package without an explicit reason. Match the file you're editing.
4. **Dead code** — Imports/variables/branches that became unreachable in the diff. Don't leave them.
5. **Abstraction without payback** — Helpers used once, factories that wrap a single concrete implementation, premature interfaces.
6. **Comment rot** — Comments that no longer describe the code they're attached to. Either fix the comment or delete it.

## Tier 3 — nice to mention, never block

These are preferences, not gates. If you bring them up, mark them `nit:` so the author knows they're optional.

- Naming clarity, refactor opportunities, alternative implementations, "while you're here" cleanups in unrelated files.

## Cross-cutting rules

- **Trust the pre-commit hook.** It runs `eslint --fix` + `check-adr` + `pack-changed`. If a PR's tests pass and ADR check passes, the _style_ is fine — focus on substance.
- **GH Actions runs on every PR.** If CI is red, investigate — it's a real failure unless it's a known baseline issue on `main` (see `.claude/rules/gotchas.md` for current baseline failures). Don't dismiss CI failures without checking `gh run list --limit 5`.
- **Agent-authored PRs** (commits with `Co-Authored-By: Claude`) get the _same_ rubric as human PRs. The author field doesn't lower or raise the bar.
- **Surface the why.** "Bug at line 42: `arr[i]` reads past `arr.length` when `i === arr.length`" beats "fix bounds check". Quote the symbol; explain the failure mode.

## Per-area emphasis

Different areas of the monorepo have different failure modes. Lean on these in addition to the rubric.

| Area                    | Typical failure modes worth a closer look                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/*` (Fastify)  | Missing auth on a new route, error responses leaking stack traces, request validation gaps (Zod), incorrect Prisma transaction boundaries, missing test for the new endpoint                  |
| `packages/rialto`       | Breaking export-map changes without changeset, `setState` inside `useEffect` body (banned), missing `displayName` on exported components, accessibility regressions on interactive primitives |
| `apps/*` (web)          | Bundle bloat from accidental heavy imports, broken SSR/CSR parity, hydration mismatches, env vars not in the right `.env.*`                                                                   |
| `packages/auth`         | Authorization checks added at the route, not the data layer; JWT verification skipped or bypassed                                                                                             |
| `infrastructure/pulumi` | `pulumi up` would change shared state without an ADR; secrets in plaintext outputs                                                                                                            |
| `prisma/migrations`     | Drop column or table, rename without backfill, schema field added without `@default` (forces NOT NULL on existing rows)                                                                       |
| `.github/workflows`     | New workflow with `permissions: write-all` instead of scoped per-job permissions; skipping `--no-verify` on commits                                                                           |

## How agents apply this rubric

`pr-review-toolkit:code-reviewer` reads this file at session start. It's expected to:

1. Run `git diff <base>..HEAD` to scope the review.
2. For each file in the diff, identify which Tier 1 categories could plausibly apply and check.
3. Use specialist agents in parallel where appropriate:
   - `adr-compliance-reviewer` for any change to `services/`, `packages/`, `apps/`
   - `migration-reviewer` for changes touching `prisma/migrations/` or `prisma/schema.prisma`
   - `silent-failure-hunter` for diffs that add `try`/`catch`, default values, or retry logic
4. Group findings by tier in the review summary. Skip Tier 3 unless asked.
5. End with a verdict: `approve` / `comment` / `request changes`.

## When the rubric is wrong

Update this file. Don't carry implicit knowledge in your head.
