# Seed backlog

Advisory inbox for ideas, not run state. Ordering is the prioritization —
top of file is proposed first. One line per seed.

- Improve `human_touch_reason` classifier precision — 10 of 11 in-window classifications land on `other`, so the taxonomy is live and correct but says almost nothing about _why_ a human intervened (from: #4241)
- Pass `VITE_SENTRY_DSN` to the rialto-web and marketing builds in `deploy-static.yml` — only the hospitality build receives it, so both other sites ship the Sentry SDK with `enabled: false` and report nothing (from: feature:rialto-game-ui)
- Give rialto-web any usage instrumentation at all — the deployed document carries exactly one script tag (the app bundle), no beacon and no edge injection, so "did anyone use this route" is unanswerable for every feature run against this app, not just early (from: feature:rialto-game-ui)
- Make the cookie banner's analytics toggle gate something, or drop it — every reference to the `analytics` preference lives inside `CookieConsent/`, so visitors are asked to consent to a category the site does not have (from: feature:rialto-game-ui)
- Assert the accessibility tree of a running page as a gate, not just axe rules — both majors in the game-UI run (duplicate status announcement, meters reporting a false 0) were invisible to axe, 2707 unit tests, typecheck, and lint (from: feature:rialto-game-ui)
- Extend the 100ms latency budget from one route to the whole catalog — `SegmentedControl`'s untokenized `0.15s` existed everywhere and was only ever caught because one route measured computed style (from: feature:rialto-game-ui)
- Give `Meter` an indeterminate state — `role="meter"` requires `aria-valuenow`, so a meter with no data currently reports a definite 0 where the truth is "unknown" (from: feature:rialto-game-ui)
- Fix `SegmentedControl` dropping a caller's `aria-label` — it spreads `{...props}` onto its wrapper while `role="radiogroup"` sits on an inner element, so the group is unnamed for every consumer (from: feature:rialto-game-ui)
- Make demo routes clear DemoLayout's fixed floating controls by default — the overlap is structural, and telemetry was simply the first route to put content in that band (from: feature:rialto-game-ui)
- Catch tests that pass against unfixed code because of module-state caching — the `matchMedia` regression test passed 8/8 before the fix and would have shipped asserting nothing (from: feature:rialto-game-ui)
- Offer the `game` vibe in DemoLayout's own vibe switcher — it hand-rolls three `<option>`s and `game` is not among them (from: feature:rialto-game-ui)
- Document that explicit `vibeOverrides` outrank the reduced-motion adapter, so a consumer can re-impose motion on a user who asked for less (from: feature:rialto-game-ui)
- Cover the `hold` feed state at route level — the hook branch is tested, the rendering is not (from: feature:rialto-game-ui)
