---
stage: capture
run: maintenance:localization-conditional-literals
date: 2026-10-18
re-entry: implement
assumptions:
  - "Origin is the feature:localization re-review (docs/features/localization/review.md, three majors) and the Owner's live answer 'One fix run, all 3' (autorun-brief.md). No backlog seed and no tracker intake issue seeded this run, so nothing is claimed in docs/backlog.md and there is no intake: field."
  - 'hospitality DashboardLayout.tsx:365 "Ctrl" goes through a catalog key like every other hit. The review called this key name ''acceptable'', but the brief''s plan is to move each literal so the tightened rule goes GREEN, and it names no eslint-disable exemption. Every locale can keep the value "Ctrl".'
  - 'DataTable''s per-row fallback gets a NEW RialtoMessages key with en-US value "Select row". It does not reuse the existing selectRow key: that key is the select column header ("Select" / "Seleccionar" / "Sélectionner", DataTable.tsx:284), so reusing it would silently change the en-US accessible name of every row checkbox.'
  - "TapeChart's English defaultStrings.ts is in scope because the brief lists it under defect 2. Its defaults come from RialtoMessages through context, as the review's fix line says. Its existing strings prop stays the consumer override."
  - 'Hospitality catalogs get an en-GB entry only if its wording differs from en-US (brief). For "Ctrl" it does not.'
  - "Implement (2026-10-18): rialto plurals stay count-taking message functions, the shape TapeChart's nightsLabel/partySizeLabel already use; RialtoMessages has no plural-category mechanism and the brief says not to invent one. Each locale encodes its own rule inside its function: en-US and es-MX singular only at 1, fr-CA singular for 0 and 1 (CLDR 'one' for fr). The CLDR 'many' form for es/fr (millions) is not modelled, since these counts are fields, results, reservations and nights."
  - "Implement (2026-10-18): TapeChart counts use ONE key, reservationCount (capitalized, as the stat pill shows it); the mobile day-card meta lowercases it with toLocaleLowerCase(formatters.locale). Right for en/es/fr; marked with a lean: comment naming the ceiling (a locale that keeps nouns capitalized needs its own key)."
  - "Implement (2026-10-18): TapeChart's defaults live in RialtoMessages as ONE nested group, tapeChart (type TapeChartMessages), whose fields mirror the component's strings prop, so mergeStrings stays a spread; this is the dictionary's first nested entry (every other key is flat). errorRetryLabel and moveCancelLabel reuse the existing tryAgain and cancel keys. The default aria template builds from messages.reservation, messages.dateSpan and two new group functions (viaSource, blockedReason). DEFAULT_STRINGS stays exported as the en-US value, so defaultStrings.test.ts is unchanged."
---

# Defect: rialto and hospitality render English through conditional string literals that no localization gate can see

## Defect

**Observed.** A literal inside a conditional or logical expression gets past both
localization gates: `{a ? "Open" : "Closed"}`, `aria-label={a ? "x" : "y"}`, and
`{a && "Saved"}`. Strings written this way stay in English under every locale.
Some of them are live in production:

1. **Live in production.** `packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx:28`
   has `aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}`.
   `GlobalNav.tsx:94` renders it, and hospitality mounts `GlobalNav` with a theme
   toggle on its authenticated shell (`apps/hospitality/src/App.tsx:101-111`).
   So es-MX, fr-CA and en-GB screen-reader users hear the English accessible name.
2. **English in five more rialto components** for any consumer that sets a locale:
   - Form's error summary (`Form.tsx:87-88`).
   - TapeChart's "Reservation(s)" (`TapeChartStatPills.tsx:34`) and
     "reservation(s)" (`TapeChartMobileStack.tsx:83`), plus its English
     `defaultStrings.ts`.
   - DataTable's "Select row" fallback (`DataTable.tsx:405`).
   - PinInput's "Code complete" live-region announcement (`PinInput.tsx:189`,
     rendered at `:250`).
   - ChatPanel's "Not allowed" denial fallback (`useChatStream.ts:139`).

   This makes `packages/rialto/CLAUDE.md:198` false. It says "Every string rialto
   renders on its own … comes from one typed dictionary".

3. **No gate catches the shape.** `mbe-local/no-literal-ui-strings` only checks
   whether the whole expression is a `Literal` or `TemplateLiteral`
   (`isTextual`, `packages/config/eslint/local-rules.js:166-175`). The e2e locale
   sweep only flags strings that are already in a catalog.

**Expected.**

- Every string that rialto or hospitality renders on its own resolves through the
  locale's messages, as ADR-028 requires: `useRialtoLocale()` / `RialtoMessages`
  in rialto, catalog keys and `t()` in hospitality.
- The lint rule reports a textual literal that is the consequent or alternate of
  a `ConditionalExpression`, or the right operand of a `LogicalExpression`. It
  does this for JSX children and for the UI attributes it already guards.

## Reproduction / Evidence

All of this was re-measured on 2026-10-18 against branch head `810736827`. That
head is cut from `origin/main`. `git diff --stat HEAD origin/main` is empty for
`apps/hospitality/src`, `packages/rialto/src` and `packages/config`, so these
results hold for current main (`949d8ecd7`).

**Lint reproduction (this becomes the regression test).** The fixture:

```tsx
export function Fixture({ a }: { a: boolean }) {
  return (
    <div aria-label={a ? "x" : "y"}>
      {a ? "Open" : "Closed"}
      {a && "Saved"}
    </div>
  );
}
```

It was run as `pnpm exec eslint --stdin --stdin-filename src/__capture_fixture.tsx`
from each package directory:

| Package            | Fixture (conditional shapes) | Control (`aria-label="x"`, `{"Open"}`)                                                                                     |
| ------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/hospitality` | **exit 0**, no output        | exit 1, 2 errors: `Hardcoded "aria-label" text…` (2:15) and `Hardcoded UI text…` (2:30), `mbe-local/no-literal-ui-strings` |
| `packages/rialto`  | **exit 0**, no output        | exit 1, the same 2 errors                                                                                                  |

The control proves the rule is active at that path. Only the conditional shapes
get through.

**Re-scan of current source.**

- **Method.** A TypeScript-compiler-API scan, `scratchpad/loc-capture/scan.mjs`.
  It covers every non-test `.ts`/`.tsx` file under `apps/hospitality/src` and
  `packages/rialto/src`, excluding `*.test.*`, `*.stories.*`, `showcase/`,
  `test/` and `generated/`, which mirrors the rule's ignores.
- **What it counts.** Every string or template literal containing a letter that
  sits as a conditional branch or the right operand of `&&`/`||`/`??`, and whose
  enclosing expression is a JSX child or a guarded UI attribute. These are the
  shapes the tightened rule must report.
- **Result.** 10 literal operands in 6 expressions:

| File:line                                                              | Context                    | Literal(s)                                                      |
| ---------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------- |
| `packages/rialto/src/components/ThemeToggle/ThemeToggle.tsx:28`        | `aria-label` attr          | `"Switch to light mode"`, `"Switch to dark mode"`               |
| `packages/rialto/src/components/Form/Form.tsx:87-88`                   | JSX child                  | `"1 field needs attention"`, `` `${n} fields need attention` `` |
| `packages/rialto/src/components/TapeChart/TapeChartStatPills.tsx:34`   | JSX child                  | `"Reservation"`, `"Reservations"`                               |
| `packages/rialto/src/components/TapeChart/TapeChartMobileStack.tsx:83` | JSX child                  | `"reservation"`, `"reservations"`                               |
| `packages/rialto/src/components/DataTable/DataTable.tsx:405`           | JSX child                  | `"Select row"`                                                  |
| `apps/hospitality/src/components/DashboardLayout.tsx:365`              | JSX child (inside `<Kbd>`) | `"Ctrl"`                                                        |

- **Count vs the review.** The review counted 9, so this scan finds one more. As
  a hypothesis, its scan did not count the template-literal branch at
  `Form.tsx:88`. The set of locations is the same: the review cited `"Ctrl"` at
  `DashboardLayout.tsx:364`, and it has moved to `:365`.
- **Other context hits.** The same scan reports 204 more conditional literals in
  other contexts, such as variables, object properties and returns. Most are
  enum tokens or CSS values, not text. The rule will not see any of them, before
  or after this fix. The ones that matter here:
  - `PinInput.tsx:189` `"Code complete"` (a variable, rendered into the live
    region at `:250`).
  - `useChatStream.ts:139` `line.reason ?? "Not allowed"` (an object property,
    rendered through `t.toolBlocked(…)`).
  - `TapeChart/defaultStrings.ts:31,34,41` (night, guest and "Reservation" plurals).
  - Two more rialto announcements that the review did not list. See Notes.

**Production evidence.** Fetched at 2026-10-18 23:49Z:

- `dig` for `mattbutlerengineering.com` gives the same Cloudflare A records from
  the LAN resolver and from `@1.1.1.1` (`104.21.25.32`, `172.67.222.73`). So the
  local DNS sinkhole is not a factor.
- `https://mattbutlerengineering.com/hospitality/` returned HTTP 200. It preloads
  `/hospitality/assets/rialto-vendor-vaLYernM.js`, which returned HTTP 200 at
  280,082 bytes.
- That chunk contains `"aria-label":r?`Switch to light mode`:`Switch to dark mode``.
  Each string has 1 hit. It also has 1 hit each for `Not allowed` and
  `Select row`.
- It has 0 hits for `Code complete` and `fields need attention`. Hospitality does
  not use PinInput or Form, so those strings are tree-shaken out.

## Root-cause hypothesis

**Hypothesis.** `isTextual` (`local-rules.js:166-175`) only returns true when the
whole expression is a `Literal` or `TemplateLiteral`. It never descends into
`ConditionalExpression` consequent/alternate, `LogicalExpression` right operands,
or parentheses. That leaves conditional literals as the one shape authors could
write without the gate objecting. The localization run then translated only what
the gate reported.

The reproduction supports this, but it does not prove that every hit traces to
that mechanism. The non-JSX hits (PinInput, ChatPanel, `defaultStrings.ts`)
would get past even a recursive `isTextual`. They are a second, smaller gap: the
rule is syntactic and only inspects JSX positions.

## Blast radius

**Production, since the localization run shipped.** Every authenticated
hospitality route renders the ThemeToggle. Non-en-US screen-reader users hear
"Switch to dark mode" / "Switch to light mode" in English. The visible UI is not
affected (it shows an icon only). ChatPanel's "Not allowed" fallback can be
reached in hospitality's `/chat` when the server sends a denial with no reason.

**rialto npm consumers that set a locale.** They get English in Form, TapeChart,
DataTable, PinInput and ChatPanel. There is no hospitality exposure for these
apart from ChatPanel. A grep of `apps/hospitality/src` for
`DataTable|<Form|PinInput|TapeChart` has no non-test hit, according to the
review.

**Documentation.** `packages/rialto/CLAUDE.md:198` and the localization run's
PRD criterion 7 are both overstated.

**Severity.** Accessibility and localization correctness. No data, security or
availability impact.

**Scale.** Small. One lint rule, about six rialto components, one hospitality
line, locale dictionaries, and docs. Review and Ship scale to that.

## Ruled out

- **The rule being off at these paths.** The bare-literal control fails with 2
  errors at the same `src/` path in both packages, so the rule is active. The
  only gap is the conditional shape.
- **The e2e locale sweep as a backstop.** By construction it only flags strings
  already present in a catalog, according to the review. It cannot see a literal
  that never made it into one. Changing it is out of scope (brief).
- **Stale production bundle or DNS artifact.** Both resolvers agree, and the
  strings appear in the chunk the live index preloads today.
- **Work already in flight.** The check ran on 2026-10-18 at about 23:50Z with
  `gh pr list --state open` and each PR's files. Two PRs are open:
  - #7089 (weekly retro docs).
  - #7078 (tier-policy CI).

  Neither touches `local-rules.js`, `packages/rialto/src`, hospitality
  `i18n/catalogs`, or `packages/rialto/CLAUDE.md`. The brief's pre-flight also
  listed #7094, which has since merged as `949d8ecd7`, a gotchas doc. **Nothing
  matches. Proceed.**

## Work items

Work in order, test first. Run the rialto `setState`-in-`useEffect` ban and the
`local-ci-precheck` steps before the first push.

- [x] **Lint rule: RED, then GREEN**
  - Add RuleTester cases to `packages/config/eslint/no-literal-ui-strings.test.ts`
    and confirm they fail.
    - **Must report:** a ternary JSX child, a ternary in a guarded attribute
      (`aria-label`), `&&`, `||` and `??` right operands, a parenthesized branch,
      a nested ternary, and a template-literal branch.
    - **Must not report:** branches with no letters, `t()` / `messages.x`
      branches, and a non-UI attribute (`variant={a ? "primary" : "ghost"}`).
  - Then make `isTextual` (`local-rules.js:166-175`) recurse through those three
    node types.
  - Accept: the new cases pass. Re-running this brief's stdin fixture exits 1 in
    both packages, with an error for each of the three shapes.
    `pnpm --dir packages/rialto lint` and `pnpm --dir apps/hospitality lint` now
    fail at exactly the 6 expressions in the re-scan table. That failure is the
    RED for the items below.
- [x] **ThemeToggle accessible name.** Add `RialtoMessages` keys for the
      light-mode and dark-mode labels, with the en-US values inline and
      translations in `src/i18n/locales/{en-GB,es-MX,fr-CA}.ts`.
      `ThemeToggle.tsx:28` reads them through `useRialtoLocale()`.
  - Accept: the existing en-US assertions in `ThemeToggle.test.tsx` still pass. A
    locale test renders the es-MX and fr-CA labels. The lint error at
    `ThemeToggle.tsx:28` is gone.
- [x] **Form error summary.** Add a count-taking message function for
      `Form.tsx:87-88` (singular and plural) to `RialtoMessages` and every locale.
  - Accept: the Form locale test shows the es-MX and fr-CA summary for 1 and for
    N errors. The lint error is gone.
- [x] **TapeChart counts.** Add a count-taking reservation message for
      `TapeChartStatPills.tsx:34` and `TapeChartMobileStack.tsx:83`. One key is
      enough if the casing difference can be resolved; otherwise use two.
  - Accept: the TapeChart locale test renders the localized pill and day-card
    meta. Both lint errors are gone.
- [x] **TapeChart `defaultStrings.ts` from context.** The defaults (status,
      room-status and overlap labels, the night and guest plurals, and the
      reservation aria template) resolve from `RialtoMessages`. A consumer's
      `strings` prop still overrides them.
  - Accept: TapeChart under an es-MX provider with no `strings` prop renders
    Spanish labels. The existing `defaultStrings.test.ts` and en-US output are
    unchanged.
  - This item carries the most new keys. Run the rialto `size-limit` right after
    it (see the last item).
- [x] **DataTable row label, PinInput announcement, ChatPanel fallback.**
  - DataTable: a new key for the per-row fallback (`DataTable.tsx:405`), en-US
    value "Select row" (see assumptions).
  - PinInput: a key for "Code complete" (`PinInput.tsx:189`).
  - ChatPanel: a key for the no-reason denial (`useChatStream.ts:139`). It
    reaches `useChatStream` through the same messages object ChatPanel already
    uses for `toolBlocked`.
  - Accept: a locale test covers each under es-MX and fr-CA. The DataTable lint
    error is gone.
- [x] **TextArea and Combobox announcements (scope widened by the Owner, 2026-10-18).**
      `TextArea.tsx:96` ("N of M characters, over limit") and `Combobox.tsx:150`
      ("N result(s) available") build English through a conditional in a
      variable or return position, which the tightened rule cannot see. Add
      `RialtoMessages` keys (a count-taking function for each) with en-US,
      es-MX and fr-CA values.
  - Accept: a locale test renders each announcement under es-MX and fr-CA; the
    en-US text is unchanged.
- [x] **Hospitality "Ctrl" key hint.** `DashboardLayout.tsx:365` reads its
      non-Mac key name from a catalog key in `en-US.json`, `es-MX.json` and
      `fr-CA.json` (no `en-GB.json` entry, because the wording is the same).
  - Accept: `pnpm check:i18n-catalogs` is green. The hospitality lint error is
    gone. `pnpm --dir apps/hospitality lint` and `pnpm --dir packages/rialto lint`
    both exit 0.
- [x] **Correct `packages/rialto/CLAUDE.md:198`.** Rewrite the Localization claim
      so it is true of the code at merge. Also name the limit: the lint rule only
      sees JSX children and guarded attributes, so a literal in a variable,
      object property or return is not caught.
  - Accept: every component named in that paragraph's claim renders localized
    text under an es-MX provider. The two out-of-scope announcements in Notes
    are either named as known gaps or fixed, if the Owner widens scope.
- [x] **Release hygiene.**
  - Add a rialto **patch** changeset in `.changeset/*.md`.
  - `pnpm check:i18n-catalogs` is green.
  - The rialto `size-limit` is green, with each `Locale <tag> (subpath)` entry at
    or under 2.2 kB (raised from 1.5 kB by the Owner, see Notes). **If any
    locale bundle exceeds its limit, stop and surface it to the Owner. Do not
    raise the limit unasked.**
  - Run the `local-ci-precheck` steps, `pnpm lint`, `pnpm typecheck`, and the
    hospitality, rialto and config unit tests.
  - Accept: all of those are green on the branch head, and the result is recorded
    in the PR body.

## Notes

- **Surfaced, not in scope (2026-10-18).** The re-scan found two more rialto
  live-region announcements that build English through a conditional. The
  review did not list them, and the tightened rule will not catch them, because
  both are in variable or return positions:
  - `TextArea.tsx:96`: `` `${currentLength} of ${maxLength} characters${isOver ? ", over limit" : ""}` ``
  - `Combobox.tsx:150`: `` `${count} result${count === 1 ? "" : "s"} available` ``

  Hospitality does not render either one with this text. No hospitality
  `<TextArea>` passes `maxLength`, and `apps/hospitality/src` has no `<Combobox>`.
  So they only affect rialto npm consumers. The Owner's scope ("all 3" review
  majors) does not cover them, so they are not work items. The CLAUDE.md item
  must not overclaim because of them. The Owner can widen scope, or a later stage
  can seed them in `docs/backlog.md`.

- **Hospitality non-JSX literals.** The scan also lists some apparently
  user-facing English in non-JSX positions that is outside this run:
  - `utils/venueOpenLabel.ts:34-35` ("Closed, opens …")
  - `utils/calendarLinks.ts:18` and `utils/ics.ts:115` ("Cancel or modify: …")
  - `hooks/use-command-palette.ts:24` ("Navigation")
  - `hooks/use-form-state.ts:37` ("Validation failed")

  They were recorded for completeness and not triaged. Some may be
  calendar-export text, not UI.

- **E2e sweep.** The brief scopes out the sweep's catalog-only detection, to be
  seeded if the lint fix does not address it. The lint fix covers JSX positions
  only, so this is still a candidate seed for Review or Ship to file.
- Scratch evidence: `scratchpad/loc-capture/` (`fixture.tsx`, `control.tsx`,
  `scan.mjs`, `scan.out`, and `dl/` with the fetched index and chunk).

- **Size-limit stop (Implement, 2026-10-18).** After the TapeChart
  `defaultStrings.ts` item (`5aea2b5e6`), `pnpm --dir packages/rialto exec size-limit`
  reports both translated locale subpaths over their 1.5 kB brotli budget:
  es-MX 1.8 kB (over by 296 B), fr-CA 1.91 kB (over by 410 B); en-GB 116 B.
  Before this run they were es-MX 1.28 kB and fr-CA 1.36 kB; after the first
  three rialto items, 1.37 kB and 1.45 kB. A throwaway probe that added the
  five remaining rialto keys (DataTable, PinInput, ChatPanel, TextArea,
  Combobox) to the locale modules, then reverted them, measured es-MX 1.9 kB
  and fr-CA 2 kB. Per the brief, Implement stopped here instead of raising the
  limit: the remaining items wait on the Owner's decision on the budget.

- **Size-limit raised to 2.2 kB (Implement, 2026-10-18, Owner's live answer
  "Raise to 2.2 kB", autorun-brief.md § Implement decision).** All three
  `Locale <tag> (subpath)` entries in `packages/rialto/package.json` moved from
  1.5 kB to 2.2 kB. Reason: TapeChart's default strings moved into the locale
  dictionaries (about 0.5 kB brotli per translated locale), and each locale
  module is a lazily loaded subpath, so the cost lands only on consumers that
  import that locale. Re-measured right after the change (before items 6-10):
  en-GB 116 B, es-MX 1.8 kB, fr-CA 1.91 kB, all under 2.2 kB. A further overrun
  past 2.2 kB is a new stop-and-surface.

- **CLAUDE.md claim re-check (Implement, 2026-10-18).** The Owner widened scope
  to TextArea and Combobox (fixed in `b66df7ea6`), so the "Surfaced, not in
  scope" note above is resolved. Re-running `scratchpad/loc-capture/scan.mjs`
  over `packages/rialto/src` after items 1-7 finds zero lint-shape hits and no
  English words among the remaining conditional literals outside `src/i18n/`
  (all are enum tokens, roles, ids or CSS values). The scan covers conditional
  and logical operands only, which is why the rewritten CLAUDE.md names the
  lint rule's JSX-only limit instead of claiming a gate covers every position.

- **Release-hygiene gates (Implement, 2026-10-18, branch head before the
  changeset commit `6d0982d3c`).** `pnpm lint` exit 0 (52/52 tasks, no
  `no-literal-ui-strings` errors); `pnpm typecheck` exit 0 (52/52);
  `packages/config` 104/104, `packages/rialto` 2717/2717 (173 files),
  `apps/hospitality` 3045/3045 (231 files); `pnpm check:i18n-catalogs` PASS;
  rialto `size-limit` exit 0 with en-GB 114 B, es-MX 1.89 kB, fr-CA 2 kB
  against 2.2 kB; `local-ci-precheck` steps: frozen install OK, `check-adr`
  and `check-deps` clean, dep-graph regen with no diff, every `mbe pack
--check` clean, `pnpm regen --check` "All generated artifacts are up to date".
