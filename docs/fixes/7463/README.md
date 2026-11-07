# #7463 — Gen browser audit evidence

Browser half of the `apps/gen` UI-quality audit. The code half landed in #7851 and #7869.

## Not baselines

The PNGs in `screenshots/` are **macOS Chromium renders for human review**. They are not visual baselines and must never be copied into a baseline directory. Baselines change only through `visual-baseline-regen.yml`.

1280px captures are downscaled to 800px wide; 375px captures are full size.

## How they were captured

- `apps/gen` built with `vite build` using fake `VITE_AUTH_*` values, served by `vite preview` on port 4175 (a port that was free; the server was started for this run and stopped after).
- Playwright (Chromium) with the same API shapes as `apps/gen/e2e/gen-api-mocks.ts`, reimplemented in a throwaway script outside the repo so the `/api/gen/specs` and `/api/gen/ui` responses could also be made slow or failing.
- Signed-in runs use a fabricated `oidc.user:<authority>:<client_id>` entry in `localStorage` (the shape `apps/gen/e2e/auth-helpers.ts` builds), and the fake authority is blocked at the network. No `.env` file was read.
- Viewports 1280x800 and 375x812, `colorScheme` light and dark, `reducedMotion: reduce`.
- States: signed-out landing; playground empty; history empty, loading (request never resolves), error (HTTP 500) and with data; generation ok, streaming (request never resolves) and error (HTTP 500); inspector in each of those.

Filenames are `<surface>-<state>-<viewport>-<scheme>.png`, for example `history-error-m375-light.png`.

## Before and after

Capturing the state before #7851 was not practical: it needs a second build of an older commit with its own dependency install. **The audit baseline is therefore main at `9c3b36310`, after #7851 and #7869.** The "before" for the fixes below is the axe output on that commit; the screenshots are of the fixed build, and the fixes are not visible in them (landmarks and names only).

## Checks run in the browser

- No horizontal scroll: `documentElement.scrollWidth <= clientWidth` evaluated on all 52 captures (every surface above, both viewports, both schemes). 0 overflowing. Raw numbers: `scroll-results.json`.
- axe-core (all rules, all impacts) on the landing and the playground, 8 combinations; plus `pageerror` and same-origin 4xx/5xx counts.

| Page            | axe on main `9c3b36310`                                                                                                            | axe after this PR | pageerror | local 4xx/5xx |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------- | ------------- |
| Landing (all 4) | none                                                                                                                               | none              | 0         | none          |
| Playground 1280 | serious `label-content-name-mismatch`; moderate `landmark-one-main`, `landmark-unique`, `page-has-heading-one`, `region` (3 nodes) | none              | 0         | none          |
| Playground 375  | moderate `landmark-one-main`, `page-has-heading-one`, `region` (3 nodes)                                                           | none              | 0         | none          |

## Findings

| #   | Rule                                                                         | Screen                                       | Viewport | Status                                              |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------- | -------- | --------------------------------------------------- |
| 1   | `accessibility/axe-serious` `label-content-name-mismatch`                    | Playground header, logo button               | 1280     | Fixed (label now contains "Gen Playground")         |
| 2   | `accessibility/axe-moderate` `landmark-one-main`, `region`                   | Playground (content in a `div`)              | 1280/375 | Fixed (`<main id="main-content">`, the skip target) |
| 3   | `accessibility/axe-moderate` `page-has-heading-one`                          | Playground                                   | 1280/375 | Fixed (visually hidden `h1` "Gen Playground")       |
| 4   | `accessibility/axe-moderate` `landmark-unique`                               | Playground, History and JSON inspector aside | 1280     | Fixed (`aria-label` "History" and "JSON inspector") |
| 5   | Toast covers Generate; failure reported three times                          | Playground after generate                    | 1280/375 | Filed #7961 (P2)                                    |
| 6   | Header wraps to two rows, orphan diamond                                     | Playground                                   | 375      | Filed #7962 (P2)                                    |
| 7   | `agent-built/icon-card-grid` (emoji cards); blank stream pane                | Playground empty, streaming                  | both     | Filed #7963 (P2)                                    |
| 8   | No horizontal scroll                                                         | All                                          | 375      | Clean                                               |
| 9   | Empty, loading and error states of prompt panel, preview, history, inspector | Playground                                   | both     | Present and distinct (#7869); no P1 found           |

No P1 was found: no blank render, no uncaught error, no failed same-origin request, no axe critical, no overflow. Findings 1 to 4 are P2 by the rubric (axe serious and moderate) and were small enough to fix here.

Not touched: auth gating, element renderers, Rialto packages.
