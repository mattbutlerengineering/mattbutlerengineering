---
stage: ship
run: maintenance:rialto-web-fonts
date: 2026-08-17
---

# Release: rialto-web web fonts restored — PR #4340, squashed to `28edc0593`

## Pre-flight

- [x] **Verification green** — `verification.md` § Failures: "None. Nothing
      routes back to Implement." 4 PASS, 1 NOT VERIFIED by construction (the
      deployed-surface check, which is this stage's post-release step).
- [x] **No secrets in diff; target config present** — `grep -icE
    "sk_live|sk_test|AKIA|BEGIN .*PRIVATE KEY"` over the full diff returned
      `0`. **No new configuration is required**: the change adds no external
      origin, and `style-src` already allowed `fonts.googleapis.com` while
      `font-src` already allowed `fonts.gstatic.com`. The single `VITE_` string
      in the diff is a pre-existing `docs/backlog.md` seed line appearing as
      context, not a code reference.
- [x] **Migrations/data changes** — none. `git diff --name-only` over the run
      matches no migration or Prisma path; the diff is one HTML entry point, one
      test, and run artifacts.
- [x] **Rollback plan concrete** — below, and its non-obvious constraint was
      measured rather than assumed.

## Rollback plan

The change is a static-site content change; `deploy-static.yml` redeploys
rialto-web on push to `main`. Reverting restores the pre-fix state — fonts fall
back to `system-ui`, which is the status quo of the previous nine weeks. There
is no data, API, auth, or migration involved, so rollback urgency is low and the
worst case is cosmetic.

**Revert the whole squash commit — never just the HTML.** Measured: restoring
`apps/rialto-web/index.html` alone while keeping the guard leaves the guard red
(`1 failed | 10 passed`), so a partial revert turns `main` red. The HTML and the
guard must move together.

```bash
git checkout main && git pull
git checkout -b revert/rialto-web-fonts
git revert --no-edit 28edc0593932cd7033f9ce3b8a605375c9b7abb6
git push -u origin revert/rialto-web-fonts
gh pr create --base main --title "revert: rialto-web font fix (#4340)" --body "…"
# merge → deploy-static.yml redeploys rialto-web automatically
```

Verify the rollback took effect the same way the fix was verified: load
`https://mattbutlerengineering.com/rialto/` in a real browser and confirm
`document.fonts.size === 0` and the preload link's `rel` is back to `preload`.

## Release log

1. `git push -u origin fix/rialto-web-fonts` → pushed; local and remote SHAs
   matched at `44aa26ee3`.
2. `gh pr create` → PR #4340 opened.
3. **CI run 1 on `44aa26ee3` → CodeQL FAILED.** Two new high-severity alerts,
   both in the guard this run added:

   ```
   scripts/__tests__/app-html-inline-handlers.test.mjs:60  Incomplete multi-character sanitization
   scripts/__tests__/app-html-inline-handlers.test.mjs:62  Bad HTML filtering regexp
                                                            (does not match `</script >`)
   ```

   Not a lint opinion — a real defect. Measured against the as-written code,
   `<script>w('<b onload="x">')</script >` returned `["onload"]`: the body was
   never scrubbed, so JavaScript inside a string was parsed as markup and
   reported as an inline handler on a file that has none.

   This was the **third** independent hole in the guard's regex HTML handling —
   after the `>`-inside-an-attribute-value miss that Review caught. Three holes
   in one small regex parser is the signal that regex was the wrong tool, so the
   scanner now walks structure explicitly: quotes tracked as state, comments
   skipped by index, raw-text bodies skipped by locating the real end tag with
   optional whitespace. Both alerts removed at the root, not suppressed.
   Committed as `7a2f149f0`; four regression cases pin the CodeQL findings.

4. **Correction to a Verify prediction.** `verification.md` predicted all 48
   rialto-web visual baselines would shift. `Visual Regression (rialto-web)`
   passed on the first run. The premise was wrong:
   `apps/rialto-web/playwright.config.ts` serves the suite with `vite dev` on
   `localhost:5173`, with no edge worker and no CSP header in the path — so
   nothing ever refused the old inline `onload` there, fonts always loaded, and
   the baselines already had DM Sans applied. Recorded as a dated correction in
   `verification.md` rather than edited away, and the underlying gap (E2E cannot
   see any CSP-caused defect) seeded to `docs/backlog.md`. Committed as
   `5e6927e5d`.
5. **CI run on `5e6927e5d` → fully green.** Zero failures across 35 checks.
   CodeQL `success`, `Visual Regression (rialto-web)` `success`, `Functional
(rialto-web)` `success`. `CI Gate` `success` on **both** channels — check-run
   and commit status — which is the state branch protection's rollup actually
   reads.
6. `gh api -X PUT .../pulls/4340/merge --merge_method squash` → `merged: true`,
   `28edc0593932cd7033f9ce3b8a605375c9b7abb6`. Deliberately no `Closes #4330`
   trailer: that issue's criteria assert against the deployed surface, which
   merging alone cannot verify.
7. **Deploy** — `deploy-static.yml` run `32063861134` on `28edc0593` →
   `completed/success`. Checked at **job** level, not just workflow level, since
   a skipped job still reports workflow success:

   ```
   success  Deploy Rialto Web          ← actually ran
   skipped  Deploy Marketing           ← correct, unchanged
   skipped  Deploy Hospitality         ← correct, unchanged
   success  Post-Deploy Verification
   ```

## Post-release checks

Work item 3 of the brief, run against production with a real browser after the
deploy completed:

```
https://mattbutlerengineering.com/rialto/
   {"fontCount":23,"families":["Bricolage Grotesque","DM Mono","DM Sans"],
    "googleSheet":true,"preloadRel":"stylesheet","body":"\"DM Sans\"","cspViolations":0}

https://mattbutlerengineering.com/rialto/demos/telemetry
   {"fontCount":23,"families":["Bricolage Grotesque","DM Mono","DM Sans"],
    "googleSheet":true,"preloadRel":"stylesheet","body":"\"DM Sans\"","cspViolations":0}
```

Against the brief's measured baseline for the same pages before this release —
`fontCount: 0`, `families: []`, `googleSheet: false`, `preloadRel: "preload"`,
one CSP violation per load, `body` resolving to the `system-ui` fallback.

Every clause of work item 3's acceptance criterion is met: `document.fonts.size

> 0`with DM Sans and Bricolage Grotesque among the loaded families,`link[data-font-stylesheet].rel === "stylesheet"`, and zero CSP violations. The
figures now match `apps/marketing`'s, which is the expected result of the two
> apps carrying byte-identical font blocks.

#4330 closed against this evidence, after the check — not by a merge trailer.

## Outcome

**Shipped with two hiccups, both caught before merge and both recorded above.**

Neither hiccup was in the fix. The HTML change was clean on every pass from
Review onward and needed no revision. Both were in the guard built to stop the
defect recurring — which is the honest lesson of this release: the code that
protects against a class of bug got it wrong three times in a row while the
one-line-shaped fix it protects was right the first time. The rollback plan was
never exercised.

The design system's showcase serves its own typefaces again, nine weeks after it
stopped.
