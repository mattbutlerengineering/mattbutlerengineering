---
stage: decompose
run: feature:hospitality-above-fold-usability
date: 2026-10-11
assumptions:
  - "Tracker export: brief says items mirror to #6367 only (no new issues); the audit + guard items carry the reference since together they satisfy the issue's acceptance criteria."
  - "wo-8/wo-9 split (shared vs per-page fixes) ordered shared-first per architecture; if the audit refutes the shared-chrome hypothesis, wo-8 is closed as not-applicable with a note, not silently skipped."
---

# Breakdown — hospitality-above-fold-usability

Work orders from reserved block wo 6–15 (wo-6 … wo-11 used; 12–15
unused). Sequential except where noted; each item is agent-sized.

- [ ] **wo-6: Audit harness + selector table** — Playwright script at
      1366×768 measuring first-content-y per page via a per-page
      primary-content selector map (all 17 pages, auth-mocked, seeded data);
      commits `audit-results.md` (page → y → space attribution) to this run
      directory. (tracker: #6367)
- [ ] **wo-7: Attribution analysis** — from wo-6 output, rank
      contributors (shell / page header / page module.css / intro blocks),
      decide shared-first vs per-page path per architecture rule, record the
      decision in `audit-results.md`. Depends: wo-6.
- [ ] **wo-8: Shared-chrome fix** — if wo-7 confirms shared origin:
      token step-down in hospitality layout/header component(s) per ux.md
      density rules; re-run audit; update results. Includes visual-baseline
      regen from CI artifact if any shared primitive moved. Depends: wo-7.
- [ ] **wo-9: Per-page fixes, worst-first** — remaining pages over the
      fold line after wo-8: trim page-level padding/intro per ux.md rules
      2–3; re-run audit per page. Depends: wo-8.
- [ ] **wo-10: Regression guard** — fold assertion (first-content-y
      < 768) in hospitality E2E, spec wired into the workflow by explicit
      path; a11y/heading-order checks stay green (SC-2). Depends: wo-9.
      (tracker: #6367)
- [ ] **wo-11: Evidence roll-up** — final before/after table in
      `audit-results.md` (SC-3), screenshots of worst three pages
      before/after at 768px. Depends: wo-10.

## Notes

- Fold line: 768 CSS px (PRD SC-1). Pages measured empty are marked so,
  never counted as passing.
- Stop-after gate: run halts here per `autorun-brief.md`
  (`stop-after: decompose`) for human review of this blueprint before
  any implementation.
