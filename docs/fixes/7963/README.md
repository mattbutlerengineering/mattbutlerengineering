# #7963 — Gen playground empty-state icons + streaming label

Fixes the `agent-built/icon-card-grid` tell filed against the `apps/gen` playground
empty state, plus the blank streaming preview, both found by the #7463 browser audit.

## Changes

- `PreviewPane`'s six prompt-suggestion cards now render a Rialto icon glyph
  (`getIcon`, from `@mattbutlerengineering/rialto`'s icon vocabulary) instead of an
  OS colour emoji. The glyph is `currentColor`, sized off `--rialto-text-xl`, and
  colored with `--rialto-text-secondary`, so it follows the active theme.
- The TTFT streaming state (`isStreaming && !spec`) now shows a visible
  "Generating…" label next to the existing pulse bar, instead of only the bar
  with an `aria-label`.
- Element renderers (`SpecRenderer`, the catalog registry) are untouched.

## How the screenshots were captured

- `apps/gen` dev server (`pnpm dev`) with fake `VITE_AUTH_*` values, port 3005.
- Playwright (Chromium) with the same `/api/gen/ui` / `/api/gen/specs` route shapes
  as `apps/gen/e2e/gen-api-mocks.ts`, reimplemented in a throwaway script outside
  the repo. `/api/gen/ui` is never fulfilled, to hold the streaming state for the
  screenshot.
- A fabricated `oidc.user:<authority>:<client_id>` entry is written to
  `localStorage` (the shape `apps/gen/e2e/auth-helpers.ts` builds); the fake
  authority is blocked at the network. No real Auth0 credentials were used.
- Viewports 1280x800 and 375x812, `colorScheme` light and dark, `reducedMotion: reduce`.
- States: playground empty (suggestion cards); generate streaming (pulse + label).

Filenames are `<state>-<viewport>-<scheme>.png`.

## Not baselines

These PNGs are Chromium renders for human review, not visual regression
baselines — they must never be copied into a baseline directory.
