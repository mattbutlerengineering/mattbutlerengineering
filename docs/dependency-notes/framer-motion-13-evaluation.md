# framer-motion 13 evaluation — August 2026

**Issue:** #4053
**Related:** PR #4058 (Dependabot `production-deps` group, currently held at `needs-review` because it silently bundles this major)

## Current state

| Dimension                           | Value                                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog pin (`pnpm-workspace.yaml`) | `framer-motion: "^12.43.0"` → evaluated bump to `"^13.1.0"`                                                                                                                   |
| Consumers                           | `@mbe/marketing` (dep, `catalog:`), `@mbe/rialto-web` (dep, was hardcoded `^12.43.0`, not `catalog:`), `packages/rialto` (dev dep `catalog:` + `peerDependencies: "^12.0.0"`) |
| Latest published                    | `13.1.0` (2026-08-10); `13.0.0` published 2026-08-05                                                                                                                          |

`apps/rialto-web/package.json` did **not** consume the catalog entry — it hardcoded its own `framer-motion` version (kept in sync manually by prior Dependabot bumps, e.g. #3749). Bumping only the catalog value would silently leave rialto-web on 12.43.0. Fixed as part of this evaluation by switching it to `"catalog:"`, matching every other catalog-managed dependency in that same `dependencies` block (`lucide-react`, `react`, `react-dom`, `react-router`).

## What actually changed in 13.0.0 / 13.1.0

Source: official `CHANGELOG.md` (`motiondivision/motion@v13.0.0`/`v13.1.0`, fetched from GitHub), the `v12.43.0...v13.0.0` compare diff (12 commits, all in-scope files listed below), and PR #3783 ("Remove automatic `@emotion/is-prop-valid` loading", fixes #2652).

**13.0.0 — 3 changes total, nothing else touched:**

1. **Breaking:** Removed automatic runtime loading of `@emotion/is-prop-valid`. Previously, `motion.*` components silently discovered this optional peer at runtime to filter which props got forwarded to the DOM — relevant only to `styled(motion.div)`-style compositions with CSS-in-JS libraries (styled-components/emotion). Fix requires explicitly injecting `isValidProp` via `<MotionConfig isValidProp={...}>` if you relied on this. `@emotion/is-prop-valid` is dropped from `peerDependenciesMeta` (confirmed via `packages/framer-motion/package.json` diff between the two tags).
2. **Fix:** SVG elements with hardware-accelerated animation now correctly sync inline `style` with SVG attributes on animation complete — this was a **regression introduced in 12.43.0** (motion's own changelog, and upstream issue #3779) where a zero-duration animation could leave `opacity` attribute and inline style out of sync. 13.0.0 fixes it, it does not introduce it.
3. **Fix:** `AnimatePresence` now correctly marks nodes as safe to remove when `propagate` renders with no `motion` children (upstream issue/PR #3777/#3784).

**13.1.0** adds `Reorder` multidimensional/RTL support only — no breaking changes, no fixes relevant to existing usage.

Confirmed via `git diff` of `packages/framer-motion/package.json`, `packages/motion-dom/package.json`, `packages/motion-utils/package.json` between the two tags: no `engines`/React version requirement changes, no other API surface changes.

## Relevance to this repo's usage

- **`@emotion/is-prop-valid` removal:** Not applicable. `grep -rn "styled-components|@emotion" apps/marketing/src apps/rialto-web/src packages/rialto/src` returns zero matches — this repo does not use CSS-in-JS styling libraries with `motion.*` components anywhere. No mitigation needed.
- **SVG hardware-acceleration fix:** Directly relevant — `packages/rialto` has 8 components animating SVG elements via `motion.svg`/`motion.circle`/`motion.g` (`Collapsible`, `Ferrofluid`, `Navbar`, `NavigationMenu`, `Select`, `Sidebar`, `Tree`, `WatchLoader`). This is a fix that benefits us (or is a no-op if the 12.43.0 regression window was never hit in practice), not a regression risk.
- **`AnimatePresence` propagate-empty fix:** `AnimatePresence` is used across ~15 rialto components (`Toast`, `Dialog`, `Drawer`, `CommandPalette`, etc.) but none use the `propagate` prop with an empty-children edge case in this codebase — reviewed usage sites, none pass `propagate` on a conditionally-empty subtree.
- **`Reorder` (13.1.0):** Not used anywhere in the repo (`grep -rln "Reorder"` on all three consumers returns zero matches).

**Conclusion: this is an unusually narrow major bump** — 3 changes total between 12.43.0 and 13.0.0, one of which (`@emotion/is-prop-valid`) doesn't apply to this codebase at all, and the other two are bugfixes that only help.

## Gates run (evidence)

All run in a fresh worktree (`pnpm install --frozen-lockfile`, then `pnpm install` after the version bump to re-resolve the lockfile) with the catalog bumped to `^13.1.0`, `apps/rialto-web/package.json` switched to `catalog:`, and the `packages/rialto` peer range widened (see below). `packages/rialto` and `packages/api-client` were built first (`pnpm build`) — both are prerequisites unrelated to this change (rialto-web/marketing import `@mattbutlerengineering/rialto`'s built `dist/`, and one rialto test imports `@mbe/api-client/streaming`).

| Gate                                                                                                                        | Result                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir packages/rialto typecheck`                                                                                      | **Pass** — 0 errors                                                                                               |
| `pnpm --dir apps/marketing typecheck`                                                                                       | **Pass** — 0 errors                                                                                               |
| `pnpm --dir apps/rialto-web typecheck`                                                                                      | **Pass** — 0 errors                                                                                               |
| `pnpm --dir packages/rialto lint`                                                                                           | **Pass** — 0 errors, 154 pre-existing warnings (React-19-idiom lints, unrelated to this bump)                     |
| `pnpm --dir apps/marketing lint`                                                                                            | **Pass** — 0 errors, 2 pre-existing warnings                                                                      |
| `pnpm --dir apps/rialto-web lint`                                                                                           | **Pass** — 0 errors, 148 pre-existing warnings                                                                    |
| `pnpm --dir packages/rialto test`                                                                                           | **Pass** — 130/130 test files, 2058/2058 tests                                                                    |
| `pnpm --dir apps/marketing test`                                                                                            | **Pass** — 26/26 test files, 288/288 tests                                                                        |
| `pnpm --dir apps/rialto-web test`                                                                                           | **Pass** — 43/43 test files, 560/560 tests                                                                        |
| `pnpm build --filter @mbe/marketing... --filter @mbe/rialto-web... --filter @mattbutlerengineering/rialto...`               | **Pass** — 7/7 turbo tasks successful (rialto lib build, rialto-web build, marketing build, plus transitive deps) |
| `pnpm exec playwright test --config apps/rialto-web/playwright.config.ts apps/rialto-web/e2e/visual.spec.ts` (local, macOS) | **46/46 passed**, 0 pixel diffs against currently-committed baselines                                             |

No new lint/type/test errors were introduced by the bump; every warning above is present identically on `main` and confirmed unrelated to framer-motion (React-19 forwardRef/context idioms, a pre-existing `manualChunks` rollup-option warning in the marketing build, etc.).

### Visual regression — inconclusive locally, by design

Per the repo's known gotcha, rialto-web visual baselines are rendered on Linux CI runners; macOS font-metric/glyph-advance differences can produce spurious diffs that a Linux run wouldn't show (and vice versa isn't ruled out either). **All 46 specs passed locally with zero pixel diffs** against the currently-committed (CI-generated) baselines — a positive data point, since a real behavioral change (e.g. from the SVG hardware-acceleration fix touching `Ferrofluid`/`WatchLoader`/`Navbar`/etc.) would be the kind of thing this suite is built to catch. But per the stated gotcha this is **not treated as authoritative** — the PR's CI run (Linux) is the decisive signal. This doc's go recommendation does not depend on the local visual result; it should be confirmed by CI on the PR before merge.

## The `packages/rialto` peer dependency

`packages/rialto/package.json` declares `peerDependencies: { "framer-motion": "^12.0.0" }`. This does not admit `13.x` — left as-is, it would make the published `@mattbutlerengineering/rialto` package appear incompatible with framer-motion 13 to any external installer running strict peer resolution, even though the dev-dependency/test/build evidence above shows it works correctly against 13.1.0.

**Changed to:** `"^12.0.0 || ^13.0.0"` — widens to admit both majors rather than dropping 12.x support outright. Rationale: this is a published package (GitHub Packages registry per `packages/rialto/CLAUDE.md`); an external consumer already pinned to framer-motion 12.x should not be forced into an unrelated major bump just to pick up a rialto patch release. Both ranges are verified compatible by the evidence above (the actually-installed dev dependency resolves to 13.1.0 in this evaluation branch, and the component code makes no version-specific API calls in either range).

## Go / no-go recommendation

**GO.** Bump `framer-motion` to `^13.1.0` in the catalog, land it as part of this issue.

Evidence: 3 real changes total in the 12.43.0→13.1.0 diff, one inapplicable to this codebase (no CSS-in-JS usage), two are pure bugfixes that only help SVG-animating components. All three affected packages (`packages/rialto`, `@mbe/marketing`, `@mbe/rialto-web`) pass typecheck, lint (0 errors), and test (100% — 2058+288+560 tests) against the bump. All three package builds succeed. The local visual regression run (advisory only per the CI-runner-specific baseline gotcha) shows zero diffs across all 46 specs — confirm on CI before merge, but nothing here points to a real regression.

### What happens to PR #4058

**Land this PR first, then re-run/rebase #4058.** Once this PR merges:

- The catalog `framer-motion: "^13.1.0"` entry, `apps/rialto-web/package.json`'s `catalog:` reference, and `packages/rialto`'s widened peer range will already be on `main`.
- #4058's framer-motion/motion-dom/motion-utils hunks become redundant (Dependabot will need to re-diff against the new `main`, likely dropping those 3 lines from its `pnpm-lock.yaml`/`pnpm-workspace.yaml` diff on next update, or the PR can be closed and re-opened by Dependabot on its next scheduled run).
- The other 31 updates in #4058 were never blocked by anything except this one — they can proceed as soon as the PR is rebased past this merge. No changes needed to those hunks.

Do not strip framer-motion out of #4058 by hand — simplest path is this dedicated PR merges first (small, single-purpose, fully gated) and #4058 gets refreshed by Dependabot afterward.

No `.github/dependabot.yml` ignore entry is needed — this is a go, not a no-go.
