# Contributing to mattbutlerengineering

Thanks for considering a contribution. This monorepo is hospitality-platform code (Rialto design system + Fastify services + React apps). Most of it is application code, not a library — but the [`@mattbutlerengineering/rialto`](./packages/rialto/) package is published to npm and accepts external contributions.

## Quick start

```bash
git clone https://github.com/mattbutlerengineering/mattbutlerengineering.git
cd mattbutlerengineering
pnpm install
pnpm dev:local        # spins up Postgres in Docker, runs schema sync, starts dev servers
```

You'll need:

- **Node 20+** (the repo uses pnpm, packaged with Corepack — `corepack enable` if needed)
- **Docker** (for the local Postgres in `pnpm dev:local`)
- **`gh` CLI** (for any of the issue-management or PR scripts)

## Where to start contributing

- **`packages/rialto/`** — the React design system. Component additions, accessibility fixes, and showcase improvements are the most welcoming entry point. See [`packages/rialto/CONTRIBUTING.md`](./packages/rialto/CONTRIBUTING.md) if it exists, otherwise [`packages/rialto/CLAUDE.md`](./packages/rialto/CLAUDE.md) has the design-system invariants.
- **`apps/marketing/`** — the public site at mattbutlerengineering.com. Copy/SEO/perf improvements welcome.
- **`docs/adr/`** — Architecture Decision Records. New ADRs go through the same PR review as code.
- **Issues labeled `good-first-issue`** — explicitly scoped for first-time contributors.
- **Issues labeled `help-wanted`** — areas where outside perspective is genuinely useful.

Issues labeled `ready` are queued for AI-agent pickup (see [How AI agents fit in](#how-ai-agents-fit-in) below). You are welcome to claim one — just comment "I'd like to take this" so the agent loop skips it.

## Branch + commit + PR workflow

1. Fork the repo, create a feature branch off `main`. Branch naming: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.

2. Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages. Pre-commit hook enforces this style implicitly via `commitlint`. Examples:
   - `feat(rialto): add SplitFlap stagger direction prop`
   - `fix(reservations): null-check booking.guest before render`
   - `docs(adr): add ADR-013 for caching strategy`
   - `chore(deps): bump turbo to 2.x`

3. Pre-commit hook runs `eslint --fix` + `check-adr` + `pack-changed`. The last one regenerates `llms.txt` files for affected packages — expect them to appear in `git status` after your commit lands; that's intentional. Don't `--no-verify`; if a hook fails, fix the underlying issue.

4. Open a PR against `main`. Use the PR template — it has a security checklist; please complete it honestly. PRs that don't fill out the template will get a comment asking you to.

5. The [tier-classifier](./.github/workflows/tier-classifier.yml) workflow auto-applies a `tier:trivial` / `tier:standard` / `tier:sensitive` / `tier:critical` label per the rules in [`docs/change-tiers.md`](./docs/change-tiers.md). The label tells reviewers (human and AI) what scrutiny to apply. You don't need to set it yourself; the classifier will.

6. Reviewers apply the rubric in [`docs/review-criteria.md`](./docs/review-criteria.md) — three tiers (must-flag / should-flag / nit), grouped by failure mode (bugs, security, ADR violations, broken contracts, etc.). It's deliberately short.

## CI status — read this

GitHub Actions runs on every PR. If CI is red, investigate — it may be a real failure or a known baseline issue on `main` (see `.claude/rules/gotchas.md`). Check `gh run list --limit 5` to see the current state.

Always verify your work locally before pushing:

```bash
pnpm lint          # ESLint across the workspace
pnpm typecheck     # tsc --noEmit across the workspace
pnpm test          # Vitest unit tests; Playwright E2E for apps that have them
pnpm build         # Turbo build of all packages and apps
```

Per-package commands also exist; see each package's `README.md` or `CLAUDE.md`.

## Code style

- **TypeScript first**. New JS files need a strong reason; default to `.ts` / `.tsx`.
- **Strict mode**. `noUncheckedIndexedAccess`, `noImplicitOverride`, etc., are on. Don't add `any` to silence the compiler — narrow with type guards or `unknown`.
- **Immutability**. Use spread/`structuredClone` over mutation. The pre-commit hook flags `setState` inside `useEffect` body in Rialto components (banned).
- **No new dependencies without justification**. Prefer the standard library, then the workspace, then existing deps. New deps are a `tier:sensitive` change.
- **One logical change per PR**. Bundling unrelated cleanups makes review hard. If you find adjacent issues, file a separate PR or add a `// TODO(<github-handle>): <followup>` comment.

## Tests

The [`coverage-gate.yml`](./.github/workflows/coverage-gate.yml) workflow enforces a **60% aggregate statement coverage** floor on every PR. PRs that drop coverage below this threshold are blocked from merging. The PR comment includes a per-package breakdown so you can see exactly which package is below the line.

- Bug fixes need a regression test that fails before your fix and passes after. If a regression test isn't possible, say why in the PR.
- New features in `services/*` need at least integration tests for the new routes.
- New Rialto components need unit tests (`*.test.tsx`), accessibility tests (`*.a11y.test.tsx` if interactive), and a showcase entry (`apps/rialto-web/src/showcase/`).

### Troubleshooting pre-commit hooks

| Symptom                                   | Fix                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `commitlint` rejects your message         | Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format: `type(scope): description` |
| `eslint --fix` changes files after commit | Stage the auto-fixed files and commit again                                                                   |
| `pack-changed` adds `llms.txt` diffs      | Expected — stage them with your commit                                                                        |
| `check-adr` fails                         | Your change touches a path governed by an active ADR — read the ADR and comply or propose an amendment        |

## Architecture decisions

If your PR introduces a pattern that isn't already in the codebase — a new framework, a new caching strategy, a new auth flow, a new database access pattern — open an ADR first under `docs/adr/`. Use the format of the existing ADRs (e.g., `docs/adr/ADR-001-rialto-over-tailwind.md`). Status starts at `proposed`; the ADR moves to `active` when the PR lands.

The `adr-compliance-reviewer` agent runs on every PR touching `services/`, `packages/`, or `apps/` and will flag changes that contradict an active ADR.

## How AI agents fit in

This repo is run partly by AI coding agents — the `ship-loop`, `issue-worker`, and `acmm-audit` flows under [`.claude/skills/`](./.claude/skills/) automate parts of the maintenance loop. Agents pick up issues labeled `ready`, work in isolated `git worktree` directories, and open PRs back to `main`.

**Your contribution is reviewed against the same rubric whether you're a human or an agent.** See [`docs/review-criteria.md`](./docs/review-criteria.md) — the "agent-authored PRs get the same scrutiny" rule is deliberate. Don't expect a lower bar because you used Cursor or Claude Code; don't expect a higher bar because you didn't.

If you're contributing _with_ AI tooling, the policy floor agents must obey is at [`docs/SECURITY-AI.md`](./docs/SECURITY-AI.md). Reading it is recommended before letting any AI tool make changes here — those rules apply to your AI tools too, even though we have no way of enforcing them on your machine.

The maturity model the repo tracks itself against (canonical 6-level ACMM, currently at L6) is at [`plugins/acmm/scripts/audit.js`](./plugins/acmm/scripts/audit.js); see [`.claude/skills/acmm-audit/SKILL.md`](./.claude/skills/acmm-audit/SKILL.md) for context.

## Things to avoid

- **Don't open PRs that span multiple unrelated areas.** Even if the diff is small, mixed scope makes review slow.
- **Don't `git push --force` to your own PR branch after it's been reviewed**, unless you genuinely need to (and even then, prefer `git push --force-with-lease`). The classifier escalates one tier when it detects a force-push after approval.
- **Don't include secrets, even in commit messages or PR bodies.** The `secrets.yaml` policy at `.github/policies/` enumerates the patterns we look for. If you accidentally push something that looks like a secret, message a maintainer immediately and we'll rotate; don't try to "git filter-repo" your way out of it without telling us.
- **Don't manually edit `llms.txt` / `llms-full.txt`.** They're auto-generated by `pack-changed` on commit. If you see one in your diff, it's because a source file in that package changed.

## License of contributions

This project is [MIT-licensed](./LICENSE). By contributing, you agree your contributions will be licensed under the same MIT terms. We don't require a CLA. If you're contributing on behalf of an employer, please confirm with them that they're okay with that before you open the PR.

## Code of Conduct

All contributors are expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). The disclosure email there is the same one in [SECURITY.md](./SECURITY.md).

## Questions

- Open a [GitHub Discussion](https://github.com/mattbutlerengineering/mattbutlerengineering/discussions) for architecture / approach questions.
- File an issue for confirmed bugs or missing functionality.
- Email the maintainer for anything sensitive (see SECURITY.md).
