---
stage: capture
run: maintenance:confirmation-copy-catalog-source
date: 2026-10-17
re-entry: implement
origin: "docs/features/remembered-on-arrival/review.md minor findings 1 and 2 (SC4 option (b), chosen by the Owner 2026-10-17 per autorun-brief.md); no backlog seed and no tracker issue"
assumptions:
  - "Locale of the quoted guest sentence in the host caption: the staff's (dashboard) locale. The caption key nests the acknowledgement by reference (`$t(bookingWidget.specialRequests.acknowledgement)`), so in every locale the host quotes exactly the sentence a guest in that locale reads. The guest's booking locale is not an option the system can offer: no Prisma schema in the repo has a locale or language column (`git ls-files '*schema.prisma' | xargs grep -i 'locale\\|language'` returns nothing), the guest locale is derived from the guest's browser at render time (`runtime.tsx` `bootTarget` -> `resolveLocale`) and never persisted, and the PRD's own caption assumption already says the caption 'describes what the guest pages show, not what this guest saw' (`remembered-on-arrival/prd.md:14`). Review recommended the same (`review.md:48`: 'the caption quotes the acknowledgement in that same locale'). Recording the booking locale would be a new capability (schema + API), out of scope."
  - "`constants/confirmation-copy.ts` is deleted, not reduced: after the ticket moves to `t()`, `SpecialRequestsTicket.tsx` is its only non-test importer (git grep), and the brief allows deletion when nothing needs it."
  - "The catalog test that replaces `confirmation-copy.test.ts` keeps its pins and the en-US honesty word list but reads the catalog through an i18next instance (so the nested caption is resolved), and moves next to the catalogs (`src/i18n/`) because its subject is now the catalog. Same assertions, retargeted, not deleted."
  - "New es-MX / fr-CA strings for the host caption are written by this run, machine-translated like the rest of those catalogs (`locales.ts` marks both `machineTranslated: true`); en-GB omits the keys and falls back to en-US, as `check-i18n-catalogs.mjs` permits."
  - "New keys live under `bookingWidget.specialRequests` (`hostCaption`) beside `label` and `acknowledgement`, so the host label reuses the existing `label` key exactly as `BriefingPage.tsx:198` already does; no second label key."
  - "E2E specs that imported `CONFIRMATION_COPY` read the en-US catalog JSON instead (they run in en-US); resolving `$t(...)` in a spec means composing the expected caption from the two en-US values, not retyping the sentence."
  - "(Orchestrator, Implement re-entry 2026-10-17) Work item 5's edit to `docs/features/remembered-on-arrival/architecture.md` is NOT made in this PR: `**/architecture.md` is a gate path in `.claude/implement-queue.md`, which would force a human merge of the whole PR and defeat the brief's merge-on-green authorization. It is listed under Notes as a separate, human-merged docs-only follow-up. The guard comment and the regen stay in scope."
  - "(Implement) Nesting path: `$t()` nesting works under the app's i18next config (`interpolation: { escapeValue: false }`, i18next 26.4.3) with no change to `runtime.tsx`. The en-US caption resolved through `localeRuntime.i18n` is byte-identical to the old constant (pinned in `special-requests-copy.test.ts`), so the `{{acknowledgement}}` interpolation fallback was not needed."
  - '(Implement) New strings: es-MX `Los invitados ven esto con: “$t(...)”` ("invitados" and curly double quotes, as the es-MX catalog already uses both); fr-CA `Les clients voient ceci avec : « $t(...) »` ("clients", spaced colon and guillemets with plain spaces, matching the existing fr-CA `« {{name}} »` entries). Machine translation, like the rest of those catalogs.'
  - "(Implement) The two old assertions whose subject no longer exists are retired with the constant, not moved: `guest catalog copy matches CONFIRMATION_COPY` (pinned the two sources equal; there is one source now) and `CONFIRMATION_COPY is frozen` (no object). Every other assertion moved to `src/i18n/special-requests-copy.test.ts`, which also adds the nesting checks (every locale's `hostCaption` contains `$t(bookingWidget.specialRequests.acknowledgement)` and not the sentence; es-MX/fr-CA resolve to a caption containing their own acknowledgement; en-GB has no `hostCaption`)."
  - "(Implement) The E2E spec reads the en-US catalog with `readFileSync` + `JSON.parse` (the `locale-sweep.spec.ts` convention) rather than a JSON `import`, and composes `HOST_CAPTION` by replacing the nested `$t(...)` with the en-US acknowledgement."
---

# Defect: Special Requests copy has two sources, and the host ticket ignores the staff locale

## Defect

Two linked defects, one fix (review SC4 option (b)).

1. **SC4 no longer holds.** The guest acknowledgement "Noted. It's on your
   reservation for the team." is a literal in two non-test files. PRD SC4
   requires exactly one (`remembered-on-arrival/prd.md:116-119`). The guard
   `confirmation-copy.source.test.ts` stays green because it scans only
   `.ts`/`.tsx`, so a retype into any `.json` under `src/` (the catalogs
   included) is invisible to it.
   - Expected: one literal, in `src/i18n/catalogs/en-US.json`. Every surface
     reads it through the i18n layer. The guard scans `.json` as well as
     `.ts`/`.tsx`.
2. **The host ticket shows English to non-English staff.**
   `SpecialRequestsTicket.tsx` renders `CONFIRMATION_COPY.specialRequestsLabel`
   and `CONFIRMATION_COPY.hostCaption`, which are fixed English strings,
   whatever the dashboard locale. On the same booking the Briefing card shows
   the translated label ("Peticiones especiales"). This breaks the
   localization PRD's "no untranslated en-US UI text" criterion
   (`docs/features/localization/prd.md:64`).
   - Expected: label and caption come from the catalog in the staff's locale.
     The caption quotes the acknowledgement by reference to its catalog key,
     so the host's quote and the guest's sentence cannot diverge in any
     locale.

## Reproduction / Evidence

Measured 2026-10-17 at `6ede6b9df` (origin/main), worktree
`.claude/worktrees/confirmation-copy-catalog-source`.

**Two non-test literals.** `git grep -n "Noted. It\|on your reservation for the team" -- apps/hospitality ':!*llms*'`:

```
src/constants/confirmation-copy.source.test.ts:19:const FRAGMENT = "on your reservation for the team";
src/constants/confirmation-copy.test.ts:33:    expect(CONFIRMATION_COPY.acknowledgement).toBe("Noted. It's on your reservation for the team.");
src/constants/confirmation-copy.test.ts:38:      "Guests see this with: “Noted. It's on your reservation for the team.”"
src/constants/confirmation-copy.ts:9:const acknowledgement = "Noted. It's on your reservation for the team.";
src/i18n/catalogs/en-US.json:1199:      "acknowledgement": "Noted. It's on your reservation for the team."
```

Non-test hits: `constants/confirmation-copy.ts:9` and `i18n/catalogs/en-US.json:1199`.

**Why the guard misses the second.** `confirmation-copy.source.test.ts:24`:

```ts
.filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes(".test."))
```

It asserts the hits equal `["constants/confirmation-copy.ts"]`, so the
`.json` copy is never seen. `confirmation-copy.test.ts:17-25` pins the en-US
catalog equal to `CONFIRMATION_COPY`. That keeps the words from drifting but
makes two sources, not one.

**The ticket's English source.** `SpecialRequestsTicket.tsx` has no
`useTranslation`/`t(` call. Its two strings are:

```tsx
import { CONFIRMATION_COPY } from "../../constants/confirmation-copy.js";
...
        {CONFIRMATION_COPY.specialRequestsLabel}   // :25
...
        {CONFIRMATION_COPY.hostCaption}            // :28
```

and `constants/confirmation-copy.ts:11-15`:

```ts
export const CONFIRMATION_COPY = Object.freeze({
  specialRequestsLabel: "Special Requests",
  acknowledgement,
  hostCaption: `Guests see this with: “${acknowledgement}”`,
});
```

The translations exist already. The catalogs' `bookingWidget.specialRequests`
(read with `node -e`):

| Locale | label                   | acknowledgement                                                |
| ------ | ----------------------- | -------------------------------------------------------------- |
| en-US  | "Special Requests"      | "Noted. It's on your reservation for the team."                |
| es-MX  | "Peticiones especiales" | "Anotado. Ya está en tu reserva para el equipo."               |
| fr-CA  | "Demandes spéciales"    | "C’est noté. C’est inscrit à votre réservation pour l’équipe." |
| en-GB  | (absent; `{}` catalog)  | (absent; falls back to en-US)                                  |

No catalog has a host-caption key. `BriefingPage.tsx:198` already renders
`t("bookingWidget.specialRequests.label")`. So in es-MX the Briefing card says
"Peticiones especiales" and the Timeline ticket for the same booking says
"Special Requests".

**Why no test caught the ticket.** `i18n/timeline-localization.test.tsx:108`
renders reservations with `notes: null`, and `SpecialRequestsTicket` renders
nothing for empty notes. The ticket is never mounted under a non-en-US locale
in any test. The `no-literal-ui-strings` lint rule only inspects JSX text,
string expressions and UI attributes, so strings imported from `constants/*`
pass it (`review.md:41`).

Not reproduced in a running browser this stage. The component has no `t()`
call, so its output does not depend on locale. Work item 2's failing test is
the executable reproduction.

## Root-cause hypothesis

Hypothesis, consistent with the history in `verification.md` and `review.md`:
#6355 (remembered-on-arrival) shipped `constants/confirmation-copy.ts` before
the catalogs existed. The localization series (#6735) moved the guest pages to
`t()` and added the acknowledgement to `en-US.json`. It pinned the two copies
equal in a test instead of making the catalog the source, and it left the host
ticket on the constant. The guard's `.ts`/`.tsx` filter predates the catalogs
and was never widened.

## Blast radius

- **Staff using es-MX or fr-CA:** the Timeline ticket's Special Requests label
  and caption are English (desktop sidebar via `ReservationDetails.tsx:166`;
  phone drawer and tablet sheet via `ReservationSheet.tsx:145`) inside an
  otherwise translated page. Cosmetic and comprehension only. The guest's own
  words render byte-for-byte, and the English caption is faithful in meaning.
- **en-US / en-GB staff:** no visible change.
- **Guests:** unaffected today. Guest pages already read the catalog.
- **Contributors:** SC4's one-source guarantee is unenforced for JSON, so a
  third copy could land unnoticed.
- **Since:** #6735 merged (localization series, 2026-10-1x).
- **Scale:** small. One component, one constants module, four catalogs, the
  tests that import the constant. No API, schema or package boundary.

## Ruled out

- **Translation quality.** Review hand-checked the es-MX and fr-CA
  acknowledgements: faithful, and no overclaims (`review.md:44,53`). Do not
  re-translate them.
- **Rendering the caption in the guest's booking locale.** Not possible today:
  no reservation records a locale (see `assumptions`). It is a new capability,
  not this fix.
- **Option (a)** (amend SC4, allow-list `en-US.json`). The Owner chose (b) on
  2026-10-17 (`autorun-brief.md`).
- **In-flight duplicate.** `gh pr list --state open` returned `[]`. No
  `docs/backlog.md` seed covers this defect.

## Work items

Test-first for each item: write or retarget the failing assertion, watch it
fail for the stated reason, then change source. Run every command in the
worktree. Run `pnpm install --frozen-lockfile` first.

- [x] **1. Guard sees JSON and targets the catalog (RED first).** Retarget
      `confirmation-copy.source.test.ts`, moving it beside the catalogs. Scan
      `.json` as well as `.ts`/`.tsx` (non-test). Expect the acknowledgement
      sentence, and the apostrophe-free fragment, in exactly one file,
      `i18n/catalogs/en-US.json`, exactly once. Read the expected sentence from
      the catalog, not a retyped literal.
  - Accept: before the source change it fails and lists both
    `constants/confirmation-copy.ts` and `i18n/catalogs/en-US.json`. After
    item 3 it passes. A throwaway retype of the sentence into another `.json`
    under `src/` makes it fail (checked by hand, then reverted).
- [x] **2. Host ticket renders the staff locale (RED first).** Add a
      `SpecialRequestsTicket` test (and/or a case in
      `timeline-localization.test.tsx` with non-empty `notes`) that renders
      under es-MX and fr-CA. Expect the catalog `label`, and a caption that
      contains that locale's acknowledgement verbatim. Keep the en-US
      assertions.
  - Accept: fails today (English shown). Passes after item 3. The es-MX
    caption contains "Anotado. Ya está en tu reserva para el equipo.". The
    fr-CA caption contains its acknowledgement.
- [x] **3. Catalog becomes the source; constant retired.** Add
      `bookingWidget.specialRequests.hostCaption` to en-US as
      `"Guests see this with: “$t(bookingWidget.specialRequests.acknowledgement)”"`.
      Add es-MX and fr-CA equivalents that nest the same key (the brief
      allows new translations). en-GB omits the key. `SpecialRequestsTicket`
      reads `t("bookingWidget.specialRequests.label")` and
      `t("bookingWidget.specialRequests.hostCaption")`. Delete
      `constants/confirmation-copy.ts`.
  - Accept: `git grep` for the sentence or the fragment finds one non-test
    file (`en-US.json`). No source file imports `constants/confirmation-copy`.
    The en-US rendered caption is byte-identical to today's:
    `Guests see this with: “Noted. It's on your reservation for the team.”`.
    Every locale's `hostCaption` contains the literal
    `$t(bookingWidget.specialRequests.acknowledgement)` and does not retype
    the sentence (a test asserts this, because `check-i18n-catalogs.mjs`
    checks `{{placeholder}}` parity but not `$t()` nesting).
- [x] **4. Retarget the copy tests; keep every assertion.** Replace
      `confirmation-copy.test.ts` with a catalog test. It pins the en-US
      label, acknowledgement (straight apostrophe), caption (resolved through
      i18next, curly quotes) and contact line. It keeps the SC8 honesty word
      lists against the en-US acknowledgement, resolved caption and contact
      line. Retarget every test that imports `CONFIRMATION_COPY`
      (`ConfirmationView.test.tsx`, `GuestDetailsForm.test.tsx`,
      `ReservationDetails.test.tsx`, `ReservationSheet.test.tsx`,
      `SpecialRequestsTicket.test.tsx`, `BriefingPage.test.tsx`,
      `ManageReservationPage.test.tsx`, `e2e/special-requests.spec.ts`) to the
      en-US catalog.
  - Accept: no test is deleted without its assertions moving. The honesty
    test passes for en-US. `git grep CONFIRMATION_COPY -- apps/hospitality`
    returns nothing outside generated `llms*.txt` (regen'd in item 5).
- [x] **5. Docs and generated artifacts.** Update the guard's header comment.
      Update `docs/features/remembered-on-arrival/architecture.md`'s copy-source
      decision (lines 6, 37, 52, 84, 154 name `confirmation-copy.ts`) to point
      at the catalog key, with a dated note that this run changed it. Run
      `pnpm build --filter @mbe/cli... && pnpm regen` and commit the
      regenerated `llms*.txt`.
  - Accept: `pnpm regen --check` is clean. No doc names
    `constants/confirmation-copy.ts` as the live source.
- [ ] **6. Gates.**
  - Accept: in `apps/hospitality`, `pnpm lint`, `pnpm typecheck` and
    `pnpm test` are green. `node scripts/check-i18n-catalogs.mjs` (repo-audit)
    passes. The local-ci-precheck steps are green. `special-requests.spec.ts`,
    `timeline-interaction.spec.ts` and `locale-sweep.spec.ts` pass locally on
    a unique port (never :3002) with rialto built.

## Notes

- Out of scope, follow-ups only (per brief): an honesty word-list test for
  es-MX/fr-CA (review finding 3); making `no-literal-ui-strings` see
  `constants/*` imports (`constants/session-lapse-copy.ts` may hide the same
  blind spot); the manage-page "confirmation email" error copy
  (`docs/backlog.md` seed, owner Matt); `briefing.spec.ts` timezone (fixed by
  #6965).
- Tracker: no intake issue, and none is created.
- **Follow-up (docs-only, human-merged; orchestrator scope change):** update
  `docs/features/remembered-on-arrival/architecture.md` lines ~6, 37, 52, 84
  and 154, which still name `constants/confirmation-copy.ts` as the copy
  source, to name the en-US catalog key
  (`bookingWidget.specialRequests.acknowledgement`, nested by `hostCaption`),
  with a dated note that this run changed it. Until then, work item 5's "no doc
  names `constants/confirmation-copy.ts` as the live source" holds for code and
  generated artifacts only.
- Release: the brief authorizes merging this run's own PR on a green CI Gate
  plus the implement-queue review gate. Deploy Static Sites (hospitality) is
  the release. Record its job-level conclusion.
- i18next 26.4.3 resolves `$t(key)` nesting by default. No catalog uses it yet
  (`git grep '\$t(' -- apps/hospitality/src` is empty), so item 3's en-US
  byte-identity check is the proof that nesting works under the app's
  `interpolation: { escapeValue: false }` config. If nesting misbehaves, the
  fallback is to pass the acknowledgement as a `{{acknowledgement}}`
  interpolation value read from the same key. That is still one literal.

## Implement log

- 2026-10-17, item 1 (RED): `git mv` the guard to
  `src/i18n/special-requests-copy.source.test.ts`, widened the filter to
  `/\.(ts|tsx|json)$/`, read the sentence from `en-US.json`, expected
  `["i18n/catalogs/en-US.json"]`. Run before any source change:
  `× only the en-US catalog contains the acknowledgement sentence` with
  `+ "constants/confirmation-copy.ts", "i18n/catalogs/en-US.json"`, and the same
  for the fragment; `Tests  2 failed | 2 passed (4)`. (First attempt failed to
  load for an unrelated reason: rialto unbuilt in the fresh worktree; fixed
  with `pnpm build --filter @mattbutlerengineering/rialto`.)
- 2026-10-17, item 2 (RED): `SpecialRequestsTicket.test.tsx` gained a
  `describe.each` over es-MX and fr-CA (bundle added and language switched on
  the app's `localeRuntime`, reset to en-US after): label from the catalog,
  caption a leaf element containing that locale's acknowledgement and not the
  English caption. `× ×4`: `Unable to find an accessible element with the role
"group" and name "Peticiones especiales"` / `"Demandes spéciales"`;
  `Tests  4 failed | 9 passed (13)`.
- 2026-10-17, item 3 (GREEN): `hostCaption` added to en-US, es-MX, fr-CA (each
  nesting the acknowledgement key; en-GB untouched, still `{}`);
  `SpecialRequestsTicket` reads both strings via `useTranslation().t`;
  `constants/confirmation-copy.ts` deleted. Items 1-4 together:
  `Test Files  3 passed (3)` / `Tests  39 passed (39)`. Hand probe: a throwaway
  `src/i18n/catalogs/zz-probe.json` holding the sentence made both guard cases
  fail (`+ "i18n/catalogs/zz-probe.json"`); deleted, guard green again.
  `git grep "Noted. It|on your reservation for the team" -- apps/hospitality/src ':!*.test.*'`
  → one hit, `en-US.json:1199`.
- 2026-10-17, item 4: `confirmation-copy.test.ts` → `src/i18n/special-requests-copy.test.ts`
  (resolved through `localeRuntime.i18n.getFixedT("en-US")`); seven test files
  and `e2e/special-requests.spec.ts` retargeted to the en-US catalog.
  `git grep -n "CONFIRMATION_COPY|constants/confirmation-copy" -- apps/hospitality llms.txt llms-full.txt`
  → empty after regen.
- 2026-10-17, item 5: guard header rewritten (names the catalog, the nesting,
  and the `.json` scan); `pnpm build --filter @mbe/cli... && pnpm regen`
  rewrote `apps/hospitality/llms*.txt` and the root `llms*.txt`, committed
  separately. architecture.md deferred (assumptions, Notes).
- 2026-10-17, item 6 (gates, apps/hospitality): `pnpm lint` exit 0
  (`✖ 145 problems (0 errors, 145 warnings)`, none in touched files);
  `pnpm typecheck` exit 0; `pnpm test` exit 0, `Test Files  222 passed (222)` /
  `Tests  2982 passed (2982)`. `node scripts/check-i18n-catalogs.mjs`:
  `PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.`
  E2E: scratch config outside the repo, `pnpm exec vite --port 3041 --strictPort`,
  synthetic unsigned OIDC session in the gitignored `e2e/.auth/user.json`
  (authority `https://e2e-local.auth0.invalid`), 1 worker, 0 retries, `TZ=UTC`:
  `special-requests.spec.ts` 6, `timeline-interaction.spec.ts` 13,
  `locale-sweep.spec.ts` 114 — `133 passed (4.2m)`. Session file and the two
  untracked screenshots deleted afterwards.
