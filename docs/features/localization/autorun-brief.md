# Autorun brief — localization

Collected 2026-10-18. The run was driven by hand and by a Conductor batch
through Decompose and Implement (tracking issue #6631, "localization: Phase 1
tracking (hospitality + rialto)", closed 2026-10-15T23:41:54Z). It had no
autorun brief until now. This file is the brief, not an artifact: it never
counts toward orientation.

## Source of interview answers

The run's own artifacts already answer every Idea/PRD/UX/Architect question:
`idea.md`, `prd.md` (`ux: required`), `ux.md`, `architecture.md`,
`breakdown.md` (25/25 items checked). Read them; this brief does not restate
them. ADR-028 (`docs/adr/ADR-028-rialto-localization-through-context.md`) is
the run's design record.

## Owner answers, 2026-10-18 (live — not assumptions)

1. **Shape:** "Verify + Review + Ship record." The implementation is merged
   and deployed; the remaining stages grade and record it.
2. **Operate:** see `operate:` below.

## Facts measured at resume (not assumptions)

- Merged on `main` (oldest first): #6591 `5c53ebf86` (foundation), #6688
  `244ec3330`, #6685 `ae18133c7` (deps), #6692 `d29d4aaaa`, #6689
  `2bec613c0`, #6703 `a878d4f7c`, #6708 `96dabae9c`, #6711 `e564a2a36`,
  #6710 `aa8eeb225`, #6706 `2ee6130ac`, #6702 `0e83dac4d`, #6721
  `a1e3aa532`, #6724 `7d05cdca5`, #6728 `304b3518a`, #6734 `5d0cb8886`,
  #6727 `8e5360b43`, #6730 `925d9f328`, #6735 `ca1c38606`, #6738
  `8e44d6b82`, #6739 `0819e5e4d`, #6740 `95669a8e7`, #6741 `42f81075f`,
  #6743 `7c01d8969` (docs). Post-ship fixes touching the same surfaces:
  #6865 `3240235b7`, #6868 `dba88e32e`, #7016 `babc45120`. Verify the list
  with `git log` — it was assembled by subject-line grep and may be
  incomplete.
- Remaining stages run in `.claude/worktrees/localization-close`, branch
  `docs/localization-close`, cut from `origin/main`. Run
  `pnpm install --frozen-lockfile` and `pnpm build --filter '@mbe/hospitality^...'`
  there before any hospitality test (rialto locale subpaths resolve from
  `dist`).
- Known local test failure, unrelated provenance unknown:
  `apps/hospitality/src/i18n/onboarding-localization.test.tsx > currency
option labels > open the select with locale-named options` fails on
  macOS on `origin/main` (seen 2026-10-18). Verify must establish whether
  it also fails in CI (Linux) before grading anything on it.
- Open-PR pre-flight at start: #7052, #7048, #7049, #7050 clean and
  awaiting the Owner; #7051 CI pending; #7047 state unknown. None touches
  i18n catalogs or rialto locale code.

## What each stage does

- **Verify** grades every PRD success criterion against `main` as it is
  now, with real commands: `pnpm check:i18n-catalogs`, the
  `mbe-local/no-literal-ui-strings` lint across `src/**`, hospitality and
  rialto unit tests, and the CI runs of `e2e/locale-sweep.spec.ts` (public
  and authenticated) — cite run IDs. **Production probe:** a real browser
  (Playwright MCP or Playwright against the live URL) on the public guest
  routes (`/hospitality/book/:venueSlug` with a real public venue slug,
  and the manage route's no-token/invalid-token state) in es-MX, fr-CA and
  en-GB, checking translated text in the DOM and a console free of CSP
  refusals. **Never log in, create a production reservation, or send an
  email.** Authenticated staff surfaces are evidenced by CI only; record
  that gap. Before trusting any third-party-host failure, cross-check DNS
  with `dig @1.1.1.1` (the LAN resolver sinkholes analytics hosts).
- **Review** reviews the change as merged (the PRs above plus anything on
  `main` since that touched the same files), against `prd.md`, `ux.md`
  and `architecture.md`/ADR-028.
- **Ship** records the release that already happened: `outcome:
released`; deploy evidence per relevant merge commit at **job level**
  (`deploy-static.yml` hospitality jobs; a cancelled per-commit run is
  covered by the next commit's run — say which); whether the rialto minor
  changeset was versioned/published, stated from evidence (npm registry
  state may be undeterminable — say so rather than guess); rollback plan.
  Ship executes **no** release action: no merge, deploy, tag, publish,
  version, or push beyond this branch. A critical review finding is a live
  production defect, reported, not a blocker. A major finding with no
  Owner answer stays open and is surfaced, never decided by the stage.
- The docs PR carrying the artifacts is opened by the orchestrator and
  left for the Owner's merge.

## Tracker

No tracker interaction. #6631 and its children are closed; do not reopen,
comment on, or create issues. Follow-ups are written as backlog-seed text
inside the artifacts, never appended to `docs/backlog.md`.

## Operate

operate:
minimum-signal: >-
One observed non-en-US use — a Sentry event or Cloudflare analytics hit
carrying a non-en-US locale, or a booking made in es-MX, fr-CA or en-GB —
OR one ui-quality-loop daily judgment of a translated page. Count
users-observed honestly from what the stage finds; 0 is valid.

## Review decisions 2026-10-18 (Owner, live — not assumptions)

`review.md` (`131b96288`) returned no critical, three majors, six minors
deferred. The Owner answered the majors together:

3. **Majors 1-3 (English ThemeToggle aria-label live on every staff page;
   five rialto components still rendering English; lint rule and e2e sweep
   blind to literals inside conditionals):** "One fix run, all 3." A
   separate maintenance run, outside this run's Ship, tightens
   `mbe-local/no-literal-ui-strings` to catch conditional/logical literals
   (RED on the ~9 found today), then moves those strings into
   en-US/es-MX/fr-CA catalog keys with a rialto changeset. Ship records all
   three as open known defects (major 1 live in production) with that fix
   run pending; they do not block the record.
