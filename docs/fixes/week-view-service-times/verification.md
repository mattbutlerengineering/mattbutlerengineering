---
stage: verify
run: maintenance:week-view-service-times
date: 2026-10-26
---

# Verification: per-service names and times in the Week view

## Summary

5/5 criteria PASS. 0 NOT RUN, 0 FAIL. The days API carries per-service
`{ name, opensAt, closesAt }` (plus `lastSeatingAt`), `presentDay` emits
localized service lines in week mode only, month view and the loading
day are unchanged, catalogs carry parity across en-US/es-MX/fr-CA, and
a stale `llms.txt`/`llms-full.txt` found during this verification pass
was regenerated and committed (`36b2de1f4`) so the regen gate is clean.

## Criteria & evidence

### Target state — `GET .../availability/days` carries per-service `{ name, opensAt, closesAt }` (defect.md)

- Check: read the extracted schema; ran the schema test suite.
- Evidence:
  ```
  packages/types/src/schemas/availability-config-api.ts:216
  export const DaySummaryServiceSchema = z.object({
    venueServiceId: z.string(),
    name: z.string(),
    opensAt: z.number().int(),
    lastSeatingAt: z.number().int(),
    closesAt: z.number().int(),
  });
  ...:241  services: z.array(DaySummaryServiceSchema),
  ...:377  focusDay: AvailabilityDaySummarySchema,   // unified with the summary, not a parallel shape

  $ pnpm --dir packages/types test -- --run
  ✓ src/schemas/availability-config-api.test.ts (22 tests) 37ms
  Test Files  29 passed (29)
       Tests  466 passed (466)
  ```
- Result: PASS

### Resolver populates `services` from `day.services` + config names, ordered, `[]` on closed day (breakdown.md WO-0073)

- Check: ran the resolver and route test suites.
- Evidence:
  ```
  $ pnpm --dir services/reservations test -- --run availability-config-checks
  ✓ src/services/availability-config-checks.test.ts (8 tests) 17ms
  Test Files  1 passed (1)
       Tests  8 passed (8)

  $ pnpm --dir services/reservations test -- --run availability-config.test
  ✓ GET /days ... AvailabilityDaySummarySchema.parse(res.json().data[0])
  Test Files  2 passed (2)
       Tests  49 passed (49)
  ```
  Resolver test file asserts a two-service day (ordered by `opensAt`), a
  whole-day closure returning `services: []`, and a special-hours day.
  Route test parses the response body against the extended schema.
- Result: PASS

### Week view renders `{name} {opensAt}–{closesAt}` lines; month view keeps count-only; accessible details speak services in order (breakdown.md WO-0074)

- Check: read `presentDay`/`AvailabilityCalendar` and ran their test suites.
- Evidence:
  ```
  $ pnpm --dir apps/hospitality test -- --run day-summary
  ✓ src/components/availability/day-summary.test.ts (4 tests) 2ms

  presentDay("2026-10-30", baseSummary, true, t, format).services ==
    [{ key: "svc-1", text: "...serviceLine Lunch|11:00|14:00" },
     { key: "svc-2", text: "...serviceLine Dinner|18:00|22:00" }]
  presentDay(..., false, ...).services == []          // month mode
  presentDay("2026-10-30", undefined, true, ...).services == []   // loading day

  $ pnpm --dir apps/hospitality test -- --run AvailabilityCalendar
  ✓ src/components/availability/AvailabilityCalendar.test.tsx (29 tests) 607ms
  Test Files  1 passed (1)
       Tests  29 passed (29)
  ```
- Result: PASS

### Localization: new catalog keys ship with es-MX and fr-CA parity (architecture.md constraint)

- Check: `pnpm check:i18n-catalogs`; inspected `serviceLine` key across catalogs.
- Evidence:
  ```
  $ pnpm check:i18n-catalogs
  PASS: Every translation catalog matches its en-US keys, placeholders and plural forms.

  $ grep serviceLine apps/hospitality/src/i18n/catalogs/*.json
  en-US.json:  "serviceLine": "{{name}} {{from}}–{{to}}"   (x2, two namespaces)
  es-MX.json:  "serviceLine": "{{name}} {{from}}–{{to}}"   (x2)
  fr-CA.json:  "serviceLine": "{{name}} {{from}} – {{to}}" (x2)
  ```
  No en-GB entry — correct per architecture.md ("en-GB only where wording
  differs"); en-GB falls back to en-US.
- Result: PASS

### Repo gates green on the final head (breakdown.md WO-0075)

- Check: typecheck for the three touched packages; `pnpm regen --check`;
  `pnpm graph && pnpm generate:dep-graph` diff check.
- Evidence:

  ```
  $ pnpm --dir packages/types typecheck        # clean, no output
  $ pnpm --dir services/reservations typecheck # clean, no output
  $ pnpm --dir apps/hospitality typecheck      # clean, no output

  $ pnpm regen --check   (before fix)
  Stale artifacts detected (1):
    [llms-txt]  llms.txt context files (.)
  $ pnpm regen && git commit -m "chore(availability): regenerate llms context for DaySummaryServiceSchema"
  $ pnpm regen --check   (after fix)
  All generated artifacts are up to date.

  $ pnpm graph && pnpm generate:dep-graph
  Generated dependency graph with 30 packages ...
  Generated dependency graph: 30 nodes, 92 edges ...
  $ git status --porcelain   # no diff after regen
  ```

  WO-0075's own outcome note had already flagged that the worktree's Bash
  allowlist didn't let it run the raw `pnpm regen`/`pnpm graph` commands
  standalone — only `scripts/conductor-gate.sh`. Verify ran them and found
  real drift (`llms.txt`/`llms-full.txt` stale from the new
  `DaySummaryServiceSchema`), regenerated, and committed the fix
  (`36b2de1f4`).

  Re-ran `bash scripts/conductor-gate.sh` in full on the post-fix head:

  ```
   Tasks:    72 successful, 72 total
  Cached:    72 cached, 72 total
    Time:    276ms >>> FULL TURBO
  [exited with code 0]
  ```

  (Includes `@mbe/route-contract:test`'s 8 files / 94 tests and every
  other package's lint/typecheck/test — same 72-task count WO-0075
  recorded.)

- Result: PASS

## Failures

None. One gap was found and fixed during this verification pass (see
the WO-0075 criterion above): `llms.txt`/`llms-full.txt` were stale
after WO-0072's schema change, because the worktree's restricted Bash
allowlist meant WO-0075's gate run never executed the raw `pnpm regen`
command. Verify ran it, confirmed real drift, regenerated, and committed
the fix as a stage-boundary-adjacent commit rather than silently
skipping it (`36b2de1f4`, on top of `c53e9916e`).

## Not verified

- **Visual/E2E baselines for the Week view**: not run. The
  `AvailabilityCalendar` component test suite (29 tests, includes week
  cells) passed, but no Playwright/visual-diff run was performed in
  this pass; visual baselines are Linux-runner-specific and this
  worktree is macOS, so a local run would produce baselines that can't
  be committed per `gotchas.md`.
- **Manual browser walkthrough of the rendered Week view**: not done;
  relied on component-test evidence (DOM assertions in
  `AvailabilityCalendar.test.tsx`) rather than a live render.
