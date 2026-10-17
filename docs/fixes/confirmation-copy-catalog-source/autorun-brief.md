---
run: maintenance:confirmation-copy-catalog-source
date: 2026-10-17
---

# Autorun brief: one source for the Special Requests copy

Collected 2026-10-17 in a live session. The Owner re-invoked autorun with
no target and, offered four options, chose **"SC4 fix, option (b)"**. That
choice settles the decision `docs/features/remembered-on-arrival/review.md`
left open on SC4: option **(b)**, not (a). This file is the brief, not an
artifact; it never counts toward orientation.

## The Owner's answers (live)

1. **Run:** a maintenance (fix) run implementing SC4 option (b):
   `apps/hospitality/src/i18n/catalogs/en-US.json` becomes the only place
   the guest acknowledgement is written; the host ticket's label and
   caption move into the catalogs (en-US, es-MX, fr-CA, en-GB); the guard
   test retargets to the catalog and scans `.json` as well as `.ts`/`.tsx`.
2. **Release authorization:** the option read "Full lint/typecheck/test/E2E
   gates; merge on green through the normal gate." So this run **may merge
   its own PR** once CI Gate is present and green and the repo's
   implement-queue gate passes (fast path if the classifier allows it,
   otherwise the universal reviewer plus every diff-matched specialist;
   never past a `hold_labels` label or a gate-path file). Merging to
   `main` triggers Deploy Static Sites for hospitality: that deploy is
   the release. Record its job-level conclusion; do not deploy by hand.

## Defect (sources, measured 2026-10-16/17)

From `docs/features/remembered-on-arrival/verification.md` (SC4) and
`review.md` (minor findings 1 and 2). Re-read the files; line numbers drift.

- **Observed vs expected (SC4).** The acknowledgement sentence is a literal
  in two non-test files: `apps/hospitality/src/constants/confirmation-copy.ts`
  (≈`:9`) and `apps/hospitality/src/i18n/catalogs/en-US.json` (≈`:1199`).
  The localization series (#6735) introduced the second copy after #6355
  merged. A test pins the two equal, so users see no drift, but SC4 ("one
  non-test source file") no longer holds, and the guard
  `confirmation-copy.source.test.ts` (≈`:24`) only scans `.ts`/`.tsx`, so
  a retype into any `.json` under `src/` passes it. Expected: one literal,
  in the en-US catalog, with the guard able to see JSON.
- **Observed vs expected (host ticket).** `SpecialRequestsTicket.tsx`
  (≈`:25,28`) renders `CONFIRMATION_COPY.specialRequestsLabel` and
  `CONFIRMATION_COPY.hostCaption` in English for every staff locale, while
  `BriefingPage.tsx` (≈`:198`) shows the catalog's translated label (e.g.
  "Peticiones especiales"). The `no-literal-ui-strings` lint rule cannot
  see strings imported from `constants/*`, which is why it passed. This
  also breaks the localization PRD's "no untranslated en-US text"
  criterion (`docs/features/localization/prd.md` ≈`:63`). Expected: the
  host label and caption come from the catalog in the staff's locale.
- **Guest/host "same words".** The host caption quotes the guest
  acknowledgement ("Guests see this with: …"). Review: the caption can
  embed the acknowledgement **by reference** to the catalog key, so the
  guest's sentence and the host's quote of it can never diverge. Which
  locale the quoted guest sentence renders in (the staff's, or the
  guest's booking locale) is a design question: Architect/Implement
  decides, logs it, and the PRD intent ("guest and host read the same
  words") is the test.
- **Reproduction.** `git grep` for the acknowledgement finds two non-test
  literals; rendering `SpecialRequestsTicket` under es-MX shows English.
- **Root-cause hypothesis.** #6355 shipped a constants module before the
  catalogs existed; #6735 added the catalog copy and pinned it equal
  instead of making the catalog the source, and left the host ticket on
  the constant.
- **Blast radius.** Hospitality staff using es-MX / fr-CA see an English
  label and caption on the Timeline ticket. Guests are unaffected today.
  Since #6735 (2026-10-1x).
- **Ruled out.** Translations themselves were judged faithful (Review hand-
  checked es-MX and fr-CA; no overclaims).

## Scope

- In: the single literal in `en-US.json`; removing or reducing
  `constants/confirmation-copy.ts` so it holds no copy literals (or deleting
  it if nothing needs it); host label + caption as catalog keys in all four
  catalogs; every consumer reading through the i18n layer; the guard test
  retargeted to the catalog and scanning `.json`; existing tests updated,
  not deleted; the honesty word-list test keeps passing for en-US.
- Out (follow-ups only): the honesty word-list test for es-MX/fr-CA
  (review finding 3); making `no-literal-ui-strings` see `constants/*`
  imports; the manage-page error copy that still mentions a confirmation
  email (`docs/backlog.md` seed exists); `briefing.spec.ts` timezone
  (fixed by #6965).
- New translations (es-MX, fr-CA) are written by the run and logged as
  assumptions; en-GB may fall back to en-US where the catalogs already do.

## Constraints

- Rialto components and `var(--rialto-*)` tokens only; no new UI.
- Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test` in `apps/hospitality`;
  `check-i18n-catalogs` (repo-audit) passes; `pnpm regen` artifacts
  committed; the Special Requests E2E specs (`special-requests.spec.ts`,
  `timeline-interaction.spec.ts`) green locally on a unique port (never
  reuse :3002), plus `locale-sweep.spec.ts` for the ticket.
- Re-entry: the capture stage decides; the expected default is
  `re-entry: implement` (scoped, with the one locale question above
  logged as an assumption). If capture judges the locale question a real
  design decision, `re-entry: architect` is acceptable.
- Tracker: no issue seeds this run, and none is created.

## Execution environment

Worktree `/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/confirmation-copy-catalog-source`,
branch `fix/confirmation-copy-catalog-source`, cut from `origin/main`.
Open-PR pre-flight at start: zero open pull requests. Run every command
there; never touch the main checkout.
