# Pitfalls Research

**Domain:** Adding WCAG AA accessibility, example page overhaul, and AI developer tooling to an existing React design system
**Researched:** 2026-03-22
**Confidence:** HIGH (code inspection of actual Rialto components + verified community patterns)

---

## Critical Pitfalls

### Pitfall 1: axe-core Cannot Resolve CSS Custom Property Contrast

**What goes wrong:**
axe-core computes color contrast from computed styles at test time. When color values live in CSS custom properties (`var(--rialto-surface)`, `var(--rialto-text-primary)`), the jsdom test environment does not resolve them — it sees a blank string, not the actual hex. axe reports no violation for what is in reality a failing contrast pair. Tests go green, dark mode ships with WCAG failures.

**Why it happens:**
The token-first system (correct for production) and the axe test suite (correct intent) operate in different environments. jsdom does not execute the CSS file that resolves the tokens. This is the single most likely blind spot for a token-based design system's automated a11y tests. The existing `accessibility.test.tsx` will never catch a `--rialto-text-secondary` on `--rialto-surface-elevated` failure because both resolve to empty strings in jsdom.

**How to avoid:**
- Automated axe tests remain valuable for structural ARIA correctness — keep them for that purpose.
- Add a separate contrast-ratio verification step that imports token hex values as JS constants and asserts 4.5:1 for normal text (WCAG 1.4.3) and 3:1 for UI components (WCAG 1.4.11). This is a Vitest test, not an axe test.
- Audit both light and dark themes independently: a token pair that passes in light mode can fail in dark mode. Any token named `*-muted`, `*-secondary`, or `*-tertiary` on any surface is high-risk.
- The Rialto CLAUDE.md explicitly calls out `--rialto-warning` (warm amber) as distinct from the gold accent — both need explicit contrast verification on all surface backgrounds.

**Warning signs:**
- axe tests pass 100% but a manual DevTools accessibility audit shows contrast warnings.
- Dark mode palette has never been audited — only the light theme was tested.
- No test file imports token hex values as literal constants for contrast calculation.

**Phase to address:** Accessibility audit phase, as the first task before any fixing work begins.

---

### Pitfall 2: Fourteen Component Directories Have No axe Test

**What goes wrong:**
The existing `accessibility.test.tsx` covers approximately 44 of 58 component directories. Missing: AppBar, AspectRatio, Autocomplete, CommandPalette, ConfirmDialog, ContextMenu, Drawer, DropdownMenu, Footer, Hero, HoverCard, InputGroup, PageHeader, Popover, ScrollArea, Tooltip. Several of these (Autocomplete, DropdownMenu, CommandPalette, Popover, ContextMenu) are the most ARIA-complex components — combobox, menu, and dialog roles with keyboard navigation — and are therefore the most likely to have violations. They are also the most commonly skipped because they require more test setup.

**Why it happens:**
The test suite was built incrementally. Simpler components got tests first. Complex interactive components that require open state, trigger simulation, and Portal rendering to be visible in the DOM are harder to configure in a test render. The skip feels justified during initial implementation but becomes the gap where real violations hide.

**How to avoid:**
- For each missing component, write the axe test before doing any fixing work. Even a minimal render is better than nothing.
- Components that render into portals (Popover, Tooltip, DropdownMenu, CommandPalette) need `document.body` as the axe target, not just the local `container`. Use `axe(document.body)` after triggering open state.
- CommandPalette and DropdownMenu need keyboard trigger simulation to open before axe runs — test the open/visible state, not the closed/idle state (which always passes).
- Do not mark the accessibility phase complete until all 58 directories have at least one axe test in an active rendered state.

**Warning signs:**
- A component directory exists with no corresponding `it(` case in `accessibility.test.tsx`.
- The axe test for a component only tests the closed/idle state — a Tooltip never shown to axe will always pass trivially.
- The coverage gap is confirmed by code inspection: diff between `ls src/components/` and test file `it()` calls shows 14 missing entries.

**Phase to address:** Accessibility audit phase, as the first task before any fixing work begins.

---

### Pitfall 3: Dialog a11y Fix Breaks Focus Return in Consuming Apps

**What goes wrong:**
Adding focus-return-on-close behavior to Dialog, Drawer, and ConfirmDialog — required for full WCAG 2.4.3 Focus Order compliance — can break hospitality app flows and rialto-web showcase pages that open dialogs programmatically without preserving the trigger element reference. If the return-focus logic throws or silently no-ops, the user's focus lands on `document.body` after close.

**Why it happens:**
The Dialog component currently implements a focus trap on open (correct — confirmed by code inspection of `Dialog.tsx` lines 42–72). It does not return focus to the previously focused element on close. Adding that behavior requires capturing `document.activeElement` before the dialog opens. If this capture is placed in the caller rather than inside the component, every consumer (hospitality `AddTableDialog`, `WalkInDialog`, rialto-web `DialogPage`) must be updated — and those that are missed silently regress.

**How to avoid:**
- Implement focus capture inside the Dialog component itself: `const previousFocus = useRef(document.activeElement as HTMLElement | null)`. Capture in the same effect that runs when `open` changes from false to true. Restore in the cleanup or when `open` changes to false.
- This approach requires zero changes to callers.
- After any Dialog/Drawer/ConfirmDialog focus management change, manually test the hospitality "Add Reservation" and "Walk-in" dialog flows — open from a button, confirm, and verify focus returns to that button.
- Add a regression test: render Dialog with a trigger button, open and close via Escape, assert `document.activeElement` is the trigger.

**Warning signs:**
- Dialog's `useEffect` for focus trap has no corresponding restore-on-close logic.
- After closing a modal in hospitality, the page scrolls to the top or has no visible focus indicator.
- Any dialog that opens from a Button — if focus jumps to `document.body` after close, this pitfall has hit.

**Phase to address:** Accessibility audit phase, specifically when auditing Dialog, Drawer, and ConfirmDialog.

---

### Pitfall 4: The Component Registry Goes Stale Without Source Generation

**What goes wrong:**
A hand-maintained `registry.json` describing component props diverges from `ButtonProps`, `TabsProps`, and other interfaces within one sprint. AI tools reading a stale registry hallucinate valid-looking code using props that were renamed, removed, or had their types narrowed. The entire purpose of the registry — stopping AI hallucination of wrong Rialto props — is undermined by its own drift.

**Why it happens:**
The registry gets written once during the milestone and treated as a static artifact. Component development continues. Nobody updates the registry because there is no automated enforcement. The `rialto-plugin` package reads from a file, not from TypeScript source. Prop changes that pass TypeScript type checking do not trigger any registry update warning.

**How to avoid:**
- Generate the registry from TypeScript source, never by hand. Use `ts-morph` or `react-docgen-typescript` to extract exported `*Props` interfaces at build time. Add this as a Turborepo pipeline step (`pnpm build:registry`) that runs after the Rialto library build.
- Treat a stale registry as a build failure: add a CI check that regenerates the registry and diffs it against the committed version. If they differ, CI fails.
- The `llms.txt` file must be generated from the same source as the registry — not written as a separate document.
- The shadcn/ui and Ant Design component registries both use generation pipelines for this reason.

**Warning signs:**
- The registry is a checked-in JSON file with no corresponding generation script in `package.json` scripts.
- A `ButtonProps` change passes TypeScript but no process requires updating `registry.json`.
- The rialto-plugin skills reference prop names not present in the current TypeScript interfaces.

**Phase to address:** Component registry phase, as the first decision: build the generation pipeline before writing any registry content.

---

### Pitfall 5: llms.txt Exceeds Context Window for the Tools It Targets

**What goes wrong:**
A single `llms.txt` that includes every component's full props table, every variant, all token values, and all usage examples grows to 300KB or more. This exceeds the practical context window budget for Claude Code and similar tools when reading the file. AI tools start truncating or ignoring it. The "comprehensive" version becomes worse than a short focused version because partial truncation produces confidently wrong results.

**Why it happens:**
Rialto has 55+ components. If each gets 200 lines of documentation (reasonable for thorough coverage), that is 11,000 lines before any tokens or patterns are included. The llms.txt format has no enforced size limit. The natural instinct is to be comprehensive.

**How to avoid:**
- Implement two files: `/llms.txt` (index — component names, one-line purpose, link to section) kept under 5,000 tokens, and `/llms-full.txt` (complete content). This is the established pattern from Nord Design System, Ant Design, and Anthropic's own docs at `docs.anthropic.com`.
- The index file contains: component name, primary use case, minimum required props, one usage line. Nothing else.
- The `rialto-plugin` CLAUDE.md already separates authoring guidance (for contributors) from consumer guidance (for callers). The llms.txt is the consumer guide — it must not include token variable names like `--rialto-surface` as API guidance. That is internal authoring detail owned by CLAUDE.md.

**Warning signs:**
- The llms.txt file exceeds 200KB.
- It includes CSS custom property names as part of the consumer API surface.
- There is only one llms.txt file — no index/full split.
- The file documents every optional prop including obscure edge-case variants.

**Phase to address:** AI tooling phase. Establish the size constraint and two-tier structure before any content is written.

---

### Pitfall 6: Example Pages Show Only Happy-Path Default Variants

**What goes wrong:**
Example pages demonstrate `<Button variant="primary">` and `<Input label="Email" />` but not `<Button disabled>`, `<Input error hint="Required field">`, or `<Select loading>`. AI tools trained on the showcase generate code using only the defaults. Developers copying examples produce forms with no error feedback, disabled states that are unclear, and loading states that were never demonstrated. The hospitality app then ships incomplete form UX patterns.

**Why it happens:**
Writing one clean example is fast. Demonstrating all 8 states of an input (idle, focused, filled, error, disabled, loading, success, warning) requires discipline and extra layout work. The existing InputPage.tsx has a good interactive playground — but many component pages show only one or two states. For AI-assisted development specifically, the showcase is training data; sparse examples produce sparse outputs.

**How to avoid:**
- For every interactive component, the example page must show: idle, error/invalid, disabled, and loading (where applicable) as simultaneously visible static renders — not only via interactive controls. A "states grid" section showing all variants side-by-side is the pattern used by Material Design, Carbon, and Primer.
- For composite pattern pages (Settings, Data Entry, Dashboard), the example must use realistic data — named fields, plausible values, real-world context. Not `label="Field 1"` / `value="test"`.
- Mark an example page as incomplete if any prop documented in the Props table has no visible rendered example.

**Warning signs:**
- A component page has only one rendered instance.
- Seeing an error or disabled state requires clicking a toggle — the state is not statically visible on page load.
- The Props table documents `error?: boolean` but no rendered example shows `error={true}`.

**Phase to address:** Example pages phase, enforced as a done criterion for each page.

---

### Pitfall 7: Treating "axe Passes" as "WCAG AA Compliant"

**What goes wrong:**
The accessibility phase ships with "all axe tests pass" as the completion criterion. Screen reader users then encounter issues axe cannot detect: illogical reading order in complex layouts, missing live region announcements for dynamic content, toast notifications that disappear before a screen reader reaches them, and keyboard trap differences between VoiceOver and NVDA in the CommandPalette.

**Why it happens:**
Automated tooling catches 30–57% of WCAG issues (Deque's own measurement from their Automated Accessibility Coverage Report). The rest require manual verification with assistive technology. axe tests are excellent for structural ARIA correctness — roles, labels, required attributes — but cannot detect whether the announced text is meaningful, whether reading order is logical, or whether live regions fire at the right time.

**How to avoid:**
- The accessibility phase must include a manual checklist alongside axe CI: keyboard-only navigation through each interactive component, screen reader announcement verification for dynamic content (Toast's `aria-live="polite"`, Alert's `role="status"`, Skeleton's `aria-busy="true"`), and reading order check for the composite example pages.
- For this project's scope (internal portfolio, no external adoption requirement), a documented manual spot-check for the 10 most complex components is sufficient. Full screen reader certification is not required.
- The Toast component's `aria-live="polite"` region requires verification that announcements are not suppressed by rapid-fire updates. The Spinner and Skeleton with `role="status"` require verification that the announcement fires at the expected time.

**Warning signs:**
- The accessibility phase success criterion says only "axe CI passes."
- No human has tabbed through the CommandPalette or the DropdownMenu using keyboard only.
- The Toast page has never been tested with VoiceOver reading the announcement aloud.

**Phase to address:** Accessibility audit phase, with explicit manual verification tasks alongside the automated suite.

---

### Pitfall 8: CLI Scaffold Copies Implementations Instead of Generating Shells

**What goes wrong:**
A `mbe scaffold component Foo` command that copies a component template file into a new directory produces a local copy that immediately diverges from Rialto authoring patterns. Six months later, scaffolded components contain hardcoded colors, old surface recipes, or motion patterns that were updated in the library. The scaffold becomes a frozen snapshot of authoring practices at the time of generation.

**Why it happens:**
Scaffolding tools that copy files are easy to build and produce satisfying results immediately. The allure is fast initial setup. But copied templates are not linked to their source. When `Button.module.css` evolves a new surface pattern or a token is renamed, scaffolded files do not update.

**How to avoid:**
- The CLI scaffold should generate the minimal file structure (directory, `.tsx`, `.module.css`) with the boilerplate patterns (forwardRef, Props interface, CSS module import, displayName) and nothing else — no implementation logic copied from existing components.
- Include a comment in the generated file pointing to `packages/rialto/CLAUDE.md` as the authoritative authoring reference for token usage, surface recipes, and motion patterns.
- The scaffold's job is to remove friction for the boilerplate, not to provide a starting implementation.

**Warning signs:**
- The scaffold copies a full component implementation rather than an empty shell.
- Generated files contain hardcoded hex values or spacing numbers instead of `var(--rialto-*)` token references.
- No reference comment points to `CLAUDE.md` as the authoring guide.

**Phase to address:** AI tooling phase (CLI scaffold). Keep the scaffold minimal and reference-oriented by design.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hand-write registry.json | Fast to start | Drifts from TypeScript source within days | Never — always generate from source |
| Single llms.txt without index/full split | One file to maintain | Exceeds AI context windows for 55+ components | Only for tiny libraries under 10 components |
| axe tests only, no manual check for interactive components | CI passes quickly | Real screen reader issues in Dialog/Toast/CommandPalette ship undetected | Never for overlay and live-region components |
| Copy component template for scaffold | Immediately satisfying output | Generated files diverge from design system patterns | Never — generate shells, not implementations |
| Dark mode visual review without token contrast test | Looks right visually | Token pairs that appear fine can fail 4.5:1 ratio | Never — token math must be verified programmatically |
| One example per component page | Example pages ship faster | AI tools learn only happy path; error states are invisible | Never for interactive form and overlay components |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| axe + jsdom + CSS tokens | Running axe expecting accurate contrast results from `var()` tokens | Use explicit hex literals in test renders OR add a separate token-contrast Vitest test that imports hex constants |
| axe + Portal components | Running `axe(container)` when component renders into `document.body` portal | Use `axe(document.body)` for Popover, Tooltip, Dialog, DropdownMenu, CommandPalette |
| axe + AnimatePresence | Testing Dialog before AnimatePresence has mounted the content | Trigger open state, await `act()`, then run axe |
| vitest-axe + happy-dom | Using happy-dom environment causes `Node.prototype.isConnected` bug | Use jsdom environment for all axe tests (already correctly set in Rialto) |
| framer-motion + reduced-motion | Global MotionConfig `reducedMotion` conflicts with per-component `useReducedMotion` guards | Prefer per-component `useReducedMotion` (already used in Button, Dialog, Tabs) over global config |
| ts-morph + monorepo tsconfig paths | Path alias resolution fails without explicit `baseUrl` | Pass the explicit tsconfig.json path to ts-morph `Project` constructor |
| llms.txt + Cloudflare Pages | Static file must be committed; no server-side generation at the edge | Generate at build time as a Turborepo pipeline step, commit the output, let CF Pages serve it statically |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Registry regeneration on every hot reload | Dev server stutters with 3–5 second rebuild delay | Add to Turborepo `build` pipeline only, not `dev` watch | Every file save during development |
| llms.txt read in full on every AI prompt | Slow context loading for every interaction | Keep index version under 20KB; reference full version only for deep component questions | Always if the file exceeds 100KB |
| All 58 axe tests in one serial describe block | Test suite takes 30+ seconds in CI | Run with `vitest --pool threads` to parallelize; current single-file structure supports this | CI with >20 components if pool is not set |

---

## "Looks Done But Isn't" Checklist

- [ ] **axe coverage complete:** All 58 component directories have at least one axe test in an open or active rendered state — not only the closed/idle state. Verify: count `it(` calls in `accessibility.test.tsx` and confirm it matches the component directory count plus named variants.
- [ ] **Token contrast verified:** A Vitest test file exists that imports token hex values as constants and asserts 4.5:1 minimum contrast for text pairings and 3:1 for UI component pairings. Both light and dark theme token sets are tested. Verify: grep for a file that calls a contrast ratio function with literal hex values.
- [ ] **Focus return implemented:** Opening and closing Dialog, Drawer, and ConfirmDialog returns focus to the element that triggered the open. Verify: open a dialog from a Button with keyboard Enter, close it with Escape, and confirm the Button has visible focus.
- [ ] **Registry is generated, not hand-written:** A `build:registry` script exists and is in the Turborepo pipeline. Verify: `pnpm build:registry` runs without error and the committed `registry.json` matches the generated output byte-for-byte.
- [ ] **llms.txt has two tiers:** An index file (under 20KB) and a full file. Verify: both files exist; the index contains component names and one-line purposes only; the full file contains complete prop tables and examples.
- [ ] **Example pages show states statically:** Every interactive component example page renders the error and disabled states visibly without requiring user interaction. Verify: view the page with JavaScript disabled; error and disabled states must be visible.
- [ ] **Apps smoke-tested after a11y fixes:** After Dialog/Drawer/ConfirmDialog focus management changes, the hospitality "Add Reservation" and "Walk-in" dialog flows have been manually tested and focus returns to the trigger button after close.
- [ ] **CLI scaffold generates a shell, not an implementation:** Running `mbe scaffold component Foo` produces a minimal file with forwardRef boilerplate and token imports, not a copy of an existing component's implementation. Verify: generated file contains no Rialto-specific implementation logic, only structural patterns.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Registry drifted from TypeScript source | MEDIUM | Discard hand-written file; implement generation script; regenerate; verify against actual component usage in apps before re-committing |
| Token contrast failures found in dark mode after ship | LOW | Identify failing token pairs using a contrast tool; update hex values in `tokens/colors.css`; re-run contrast test to verify fix |
| Focus return broke hospitality dialogs | MEDIUM | Roll back Dialog focus management change; re-implement using `previousFocus = useRef(document.activeElement)` capture inside the component; re-test all three apps |
| llms.txt too large for context | LOW | Split into index + full files; update rialto-plugin skills reference to use index; update CLAUDE.md pointer |
| 14 components missing from axe suite | LOW | Add test cases to existing `accessibility.test.tsx` — mechanical work, approximately 1–3 hours for basic coverage |
| Example pages show only defaults | MEDIUM | Add states-grid sections to each component page retroactively; each page is independent so this can be done incrementally |
| Scaffold copied implementations | MEDIUM | Delete generated files in consuming code; redesign scaffold to output shells only; re-generate; update consuming code against Rialto patterns |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CSS token contrast invisible to axe | Accessibility — first task: write token contrast checker before any axe work | CI runs a dedicated contrast test file alongside axe tests |
| 14 components missing from axe suite | Accessibility — audit existing coverage before any fixing begins | `grep -c "it(" accessibility.test.tsx` matches component directory count |
| Focus return breaks consuming apps | Accessibility — when touching Dialog, Drawer, ConfirmDialog | Manual smoke-test of hospitality dialogs after every overlay component change |
| Registry goes stale immediately | Component registry — build generation pipeline before writing any content | `pnpm build:registry` runs in CI and diffs against committed file |
| llms.txt too large | AI tooling — define size constraints and two-tier structure before writing | Index file size check in CI; index under 20KB enforced |
| Examples show only happy path | Example pages — add "all states statically visible" as done criterion for each page | Visual review: no interaction required to see error and disabled states |
| axe passes but manual issues remain | Accessibility — add manual checklist alongside axe CI | Documented manual verification for Dialog, DropdownMenu, CommandPalette, Toast |
| CLI scaffold copies implementations | AI tooling — scaffold design decision before any generation code is written | Generated files contain no implementation logic; only boilerplate shell |

---

## Sources

- Deque — Automated Accessibility Coverage Report: axe-core catches 57% of WCAG issues on average (https://www.deque.com/automated-accessibility-testing-coverage/)
- vitest-axe — known happy-dom incompatibility with `Node.prototype.isConnected` (https://github.com/chaance/vitest-axe)
- BOIA — Dark mode does not satisfy WCAG contrast requirements; each theme must be tested independently (https://www.boia.org/blog/offering-a-dark-mode-doesnt-satisfy-wcag-color-contrast-requirements)
- Nord Design System — two-tier llms.txt index/full pattern in production (https://nordhealth.design/ai/llms-txt/)
- Ant Design — structured component registry format via llms.txt (https://ant.design/docs/react/llms/)
- Motion.dev — useReducedMotion API and accessible animation guidance (https://motion.dev/docs/react-accessibility)
- WCAG 2.1 Success Criterion 1.4.3 — contrast minimum requirements (https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- WCAG 2.4.3 — Focus Order, including return-focus-on-close for dialogs (https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html)
- Code inspection of `packages/rialto/src/components/accessibility.test.tsx` — 14 component directories confirmed missing from test suite
- Code inspection of `packages/rialto/src/components/Dialog/Dialog.tsx` — focus trap confirmed present; return-focus-on-close confirmed absent
- Code inspection of `packages/rialto/src/components/` — 58 component directories total, 44 covered by existing axe tests

---
*Pitfalls research for: Rialto v1.1 — WCAG AA accessibility, example pages overhaul, AI developer tooling*
*Researched: 2026-03-22*
