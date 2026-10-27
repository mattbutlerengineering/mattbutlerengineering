# Rialto Design System

Design philosophy, token inventories (surface/text/border/semantic colors, spacing, radius and shadow tiers), file maps and background detail: [docs/reference.md](./docs/reference.md).

---

## Token Usage Rules

### Colors

- **Never hardcode colors.** Always use `var(--rialto-*)` tokens.
- Gold accent: `--rialto-accent` — ONLY for focus rings, active/selected states, primary action fills
- Never use gold for decorative purposes, backgrounds, or text color (except on gold-filled buttons)
- Never hardcode semantic colors — always use the tokens (replaces old `#c49a2a` pattern)

### Typography

- Body/UI text: `var(--rialto-font-sans)` — DM Sans (humanist sans-serif)
- Display headings: `var(--rialto-font-display)` — Bricolage Grotesque (clean, warm grotesque with optical sizing)
- Use display font for Hero titles, PageHeader titles, and `Text variant="display"`
- Use sans font for body text, card titles, buttons, form labels, and all other UI
- Use the type scale tokens: `--rialto-text-xs` through `--rialto-text-4xl`
- Maximum 3 weights: 300 (light), 400 (regular), 500 (medium)
- Headings: slightly tighter letter-spacing via `--rialto-tracking-tight`
- Body: natural letter-spacing

### Spacing, radius, shadows

- Base unit: 4px. All spacing uses `--rialto-space-*` tokens.
- Radius follows the hierarchy (`--rialto-radius-sharp` / `-default` / `-soft` / `-round`) and elevation the `--rialto-shadow-*` tiers — pick from the tables in [docs/reference.md](./docs/reference.md#token-inventory).

### Easing

- **Never hardcode easing curves.** Use `var(--rialto-ease-precision)` for crisp transitions
- Use `var(--rialto-ease-smooth)` for gentle entrances and exits
- All CSS transitions must use easing tokens, not raw `cubic-bezier()`

### Direction / RTL

- **Always use CSS logical properties** instead of physical directional properties:
  - `margin-inline-start` / `margin-inline-end` (not `margin-left` / `margin-right`)
  - `padding-inline-start` / `padding-inline-end` (not `padding-left` / `padding-right`)
  - `inset-inline-start` / `inset-inline-end` (not `left` / `right`)
  - `border-inline-start` / `border-inline-end` (not `border-left` / `border-right`)
  - `text-align: start` / `text-align: end` (not `text-align: left` / `text-align: right`)
- **Exception — `transform-origin`:** Does not support logical keywords. Use `left`/`right` with a `[dir='rtl']` override.
- **Exception — `translateX` in animations:** Centering (`translateX(-50%)`) is axis-relative and stays as-is. Directional animations (shimmer, progress) need RTL keyframe variants with `[dir='rtl']` selector.

---

## Motion Rules

### When to animate

Decide _whether_ before _which curve_. Policy (purpose test, frequency budget, productive vs expressive tier, restraint rules, signature moments) lives in [docs/motion.md](./docs/motion.md). Short form: no motion or an opacity-only fade on 100+/day paths, at most `--rialto-duration-fast` opacity/colour on hover, one expressive element per view, never scale from below 0.9.

### When to use precision easing

- Standard UI transitions (hover, color changes, opacity)
- Small movements (< 4px translation)
- State changes that should feel instant and crisp ("rotary click")
- Resolve it: `const motionPreset = useMotionPreset()` → `motionPreset.precision`

### When to use spring physics

- Toggle switches, sliders — anything with a "detent" feel
- AI-driven elements, generative content
- Larger movements (dialogs entering, cards expanding)
- Elements that should feel organic and physical
- Resolve it: `const motionPreset = useMotionPreset()` → `motionPreset.spring` / `motionPreset.springGentle`

### Reduced motion and boop

- `useMotionPreset()` already returns instant transitions under `prefers-reduced-motion` — pass `motionPreset.spring` etc. straight to `transition`; never hand-build a `shouldReduceMotion ? { duration: 0 } : …` fallback
- Need the preference itself (to drop a slide offset from `initial`)? Read `motionPreset.reduced` — the same signal. Do not call framer's `useReducedMotion()`
- Hover boop: `whileHover={disabled ? undefined : motionPreset.boop}` — it is already at-rest scale under reduced motion

### General motion rules

- **Resolve motion configs through `useMotionPreset()`, don't import them.** A
  config imported straight from `tokens/motion.ts` is a value no vibe can
  retime — see [ADR-025](../../docs/adr/ADR-025-motion-presets-through-context.md).
  The statics remain the default the hook returns; import them directly only
  outside a component (e.g. a variants object defined at module scope).
- Framer Motion for all animations (not CSS transitions for interactive elements)
- CSS transitions are acceptable for simple hover color changes
- Never animate layout properties directly (use Framer Motion `layout` prop)
- Disabled elements have no motion

---

## Component Authoring Patterns

### Wiring up a new component

One folder per component under `src/components/ComponentName/` (`.tsx`, `.module.css`, `.test.tsx`, `index.ts` — layout in [docs/reference.md](./docs/reference.md#component-file-structure)).

**Also wire up:**

- Add `export * from "./ComponentName";` to `src/components/index.ts` (the root barrel — components invisible to consumers otherwise)
- Add an axe-core entry in the relevant `src/test/accessibility/*.accessibility.test.tsx` file to guarantee WCAG compliance
- For the showcase app, three touch points: `apps/rialto-web/src/pages/<category>/ComponentNamePage.tsx`, a `lazy()` import + route in `apps/rialto-web/src/routes.tsx`, and a nav entry in `apps/rialto-web/src/data/nav-sections.ts`
- Rebuild the package (`pnpm build`) before typechecking `apps/rialto-web` — consumer sees new exports only via regenerated `.d.ts` files

### Props API conventions

- Extend native HTML element props where appropriate
- `variant` prop for visual variants (e.g., `"primary" | "secondary" | "ghost"`)
- `size` prop if multiple sizes exist (e.g., `"sm" | "md" | "lg"`)
- Boolean props for states: `disabled`, `loading`
- Use `React.forwardRef` for all components
- Export props interface as `ComponentNameProps`

### Styling approach

- CSS Modules for scoping (`.module.css` files)
- All visual values from CSS custom properties — no hardcoded colors, spacing, or radii
- Surface recipes from `surfaces.module.css` composed into component styles
- State styles (hover, active, focus, disabled) are required for every interactive component
- Use `composes` in CSS modules to share surface patterns

### Accessibility requirements

- All interactive elements must be keyboard accessible
- Focus states use the gold glow ring (`--rialto-shadow-focus`)
- ARIA attributes where semantics aren't implicit
- Color contrast: text on surfaces must meet WCAG AA (4.5:1 for normal text)
- Reduced motion: respect `prefers-reduced-motion` media query
- Focus shifts after a state change: use `useEffect` with a mount-guard ref, NOT `requestAnimationFrame`. testing-library doesn't await rAF callbacks, so tests time out.
- Reading a ref's `.current` in JSX triggers `react-hooks/refs` ESLint error — keep values used in render in state, not refs.
- **Overlay/popup components that open from a trigger must call `useReturnFocus(open)`** (`src/hooks/useReturnFocus.ts`) and add a matching `it("<Name> returns focus to trigger on close", ...)` test to `src/test/accessibility/focus-management.accessibility.test.tsx`. The hook must capture in a `useLayoutEffect`, not a plain `useEffect` (why: [docs/reference.md](./docs/reference.md#why-usereturnfocus-captures-in-a-layout-effect), #5618). The test file's own coverage-guard test greps every component for a direct `useReturnFocus(` call and fails if the matching test is missing, so a new overlay can't silently skip this. Components with no separate trigger element (Combobox/Autocomplete — the `<input>` itself never loses focus, per the ARIA APG combobox pattern) or that never take focus at all (Tooltip/HoverCard) get a different, documented assertion instead of this contract — see that file's own comments.

---

## AI Assistant Reference

For component usage reference (choosing components, props API, composition patterns),
see `llms-full.txt` in the repo root (or `llms.txt` for a condensed overview).
This file (CLAUDE.md) covers authoring and contributing to Rialto;
llms-full.txt covers consuming the library in an application.

Before writing any page UI, read `.claude/rules/ui-quality.md` — the tells the daily ui-quality loop files, each answered by a token rule above.

## Commands

- `pnpm dev` — Start dev server (run from monorepo root)
- `pnpm build` — Build library for production
- `pnpm test` — Run unit tests
- `pnpm typecheck` — Type-check without emitting

## Localization

Every string rialto renders on its own (accessible names, default button labels, live-region announcements) comes from one typed dictionary, provided through context ([ADR-028](../../docs/adr/ADR-028-rialto-localization-through-context.md)).

- **Dictionary:** `RialtoMessages` in `src/i18n/messages.ts`, with the en-US values inline as the default. Other locales are `src/i18n/locales/{en-GB,es-MX,fr-CA}.ts`, published as `@mattbutlerengineering/rialto/locales/<tag>` subpaths and typed `RialtoMessages`, so a missing key fails typecheck. Interpolated entries are functions, e.g. `pageNumber: (page: number) => string`. Count-dependent text is a function of the count, and each locale encodes its own plural rule inside it (e.g. `resultsAvailable`; French takes the singular for 0 and 1). TapeChart's defaults are one nested group, `tapeChart`, mirroring its `strings` prop.
- **Provider:** `RialtoLocaleProvider` / `useRialtoLocale()` (`src/i18n/RialtoLocaleProvider.tsx`, exported from `@mattbutlerengineering/rialto/providers`). Components read `useRialtoLocale().messages`; with no provider they fall back to en-US.
- **Adding a key:** add it to `RialtoMessages` and give it a value in every locale module in the same change. Text a consumer owns (e.g. `GlobalNav` link names) comes in as an optional prop that defaults to the built-in label, not as a dictionary key.
- **Lint rule:** `mbe-local/no-literal-ui-strings` is an error across `src/**` (`LOCALIZED_FILES` in `eslint.config.js`). It only sees JSX: text children and the UI attributes it guards (`aria-label`, `title`, `placeholder`, `label`…), including a literal that reaches them through a ternary or a `&&` / `||` / `??` right operand. A literal held in a variable, object property or return value is out of its sight (live-region announcements are usually built that way), so those strings stay correct only through review and the locale tests.
- **Tests:** per-family locale tests (`src/components/*-locale.test.tsx`) render components under es-MX/fr-CA providers.
- **Changesets:** any change to rialto source, a new message key or locale API included, needs a **patch** changeset (`.changeset/*.md`).

## Exports Map

The `exports` field in `package.json` is auto-generated by `pnpm build` (how: [docs/reference.md](./docs/reference.md#exports-map-generation)). After adding a new component:

1. Wire it up in `src/components/index.ts` (barrel export)
2. Run `pnpm build` — regenerates `registry.json`, the manifest, and the exports map together
3. If the exports map gets out of sync with the source (a common drift gotcha), run `pnpm exports` standalone to fix it

`pnpm exports:check` validates the exports map without overwriting — useful in CI to catch drift.

## Publishing

- Publishes to **GitHub Packages** (`npm.pkg.github.com`), not npm — `npm view @mattbutlerengineering/rialto` returns 404
- Release flow: bump `version` in `package.json` → `pnpm build` → `npm publish` in this dir (use `npm publish` directly, NOT `pnpm publish --no-git-checks` — pnpm forwards that flag to npm which errors with `EUSAGE`)
- Version convention (pre-1.0): every release is a patch bump regardless of feature volume

## Gotchas (session-tested)

- Semantic headings: use `<Heading level={1-6} size={1-6}>` — `level` drives the `h{level}` tag, `size` is the visual override. Sizes 1–4 use display font; 5–6 use sans (UI-chrome titles). Don't hand-roll `<h1>..<h6>` — Dialog, Drawer, PageHeader, ErrorBoundary all consume Heading. `Text variant="display"` is for non-semantic hero text, not headings
- `Text` variants: `"body" | "caption" | "detail" | "label" | "display"` — no heading variants; use the `Heading` primitive
- `src/test/setup.ts` runs every test reduced by default — its `matchMedia` stub matches `prefers-reduced-motion: reduce` (what `useMotionPreset()` reads) and it mocks `framer-motion.useReducedMotion` to throw — a tripwire, since no rialto source may call it (guarded by `src/test/motion/no-framer-reduced-motion.test.tsx`). Motion-gated branches are invisible in tests by default. To test the animated path, call `stubMatchMedia([])` from `src/test/match-media.ts` at file top level (and `setMatchingMedia([...])` to switch device per test); to assert the transition a component actually renders, mock framer-motion with `recordingFramerMotion()` from `src/test/record-motion.ts`
- `Stack` `wrap` prop is `boolean`, not a string
- Showcase scaffolding: `<ComponentPageLayout name=... />` (not `title`), `<PropsTable props={[...PropDef]} />` (not `rows`)
- axe tests in jsdom must disable `color-contrast`: `axe(c, { rules: { "color-contrast": { enabled: false } } })` — `token-contrast.test.ts` covers token contrast separately
- ARIA grid: `role="columnheader"` needs a `role="row"` parent; `role="list"` children must be `role="listitem"` (not arbitrary `<section>`) — axe catches both
- `tsconfig` has `noUncheckedIndexedAccess` — `const [y, m, d] = iso.split("-").map(Number)` types as `number | undefined`; use `Number(parts[0] ?? 0)` or a guarded helper before `Date.UTC(...)`
