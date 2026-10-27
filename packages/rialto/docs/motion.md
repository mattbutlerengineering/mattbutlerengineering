# Rialto Motion Policy

Rialto has motion **mechanics** (tokens, `useMotionPreset()`, the reduced-motion adapter) and, with this page, motion **policy**: _when_ to animate at all, which tier, how long, how many things at once, and what never moves. The mechanics live in [`src/tokens/motion.ts`](../src/tokens/motion.ts), [ADR-025](../../../docs/adr/ADR-025-motion-presets-through-context.md) and [vibes.md](./vibes.md#the-reduced-motion-adapter). The live token demos are on the rialto-web Motion page.

The brand is speakeasy, royal, gen-z: motion is where the personality lives. The rule that keeps it from being overwhelming is that personality is **spent on rare moments and withheld from frequent ones**. A staff member taps the same control a hundred times a shift; a guest confirms a first booking once. The first gets silence and speed, the second gets the pzazz. Accessibility always outranks flair.

## 1. The purpose test

An animation ships only if it does at least one of these:

1. **Feedback** — the action registered (press, toggle, submit).
2. **State change** — something is now different (open, selected, live, failed).
3. **Spatial continuity** — where something came from or went (a drawer from its edge, a toast to its stack).
4. **Attention** — one thing needs the eye (a new error, an arriving table).
5. **Delight at a rare moment** — see [Signature moments](#6-signature-moments).

"It looks cool" on a frequent path is not a purpose. No purpose, no animation.

## 2. Frequency budget

Decide motion by how often a person meets the interaction, not by how nice it would look.

| How often       | Examples                                                                | Motion                                                                                        |
| --------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 100+ per day    | keyboard shortcuts, command palette open, typing, tab and filter switch | None. Instant.                                                                                |
| Tens per day    | hover, list navigation, menus, tooltips, select                         | At most `--rialto-duration-fast` (100ms), opacity or colour only. No travel, no scale.        |
| Occasional      | dialogs, drawers, toasts, banners, confirm, collapse                    | Standard enter and exit: `precision` or `springGentle`, 150 to 200ms feel, travel under 16px. |
| Rare (once-ish) | onboarding, first booking, booking confirmed, empty to first data       | Expressive: springs, stagger, signature instruments. This is where the pzazz goes.            |

If a surface is both frequent and a candidate for delight, the frequency wins.

## 3. Two tiers

Rialto uses a productive and expressive split (as in Carbon), mapped onto tokens that already exist. There are no new tokens for it.

| Tier           | Where                                                                       | Tokens and presets (resolve through `useMotionPreset()`)                                                                                                           |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Productive** | Staff tools: hospitality dashboard, floor, tables, forms, menus, data views | `precision` (150ms, `[0.2, 0, 0, 1]`), `--rialto-duration-fast\|standard\|slow`, `--rialto-ease-precision`. Opacity, colour and small (under 16px) transform only. |
| **Expressive** | Marketing, guest-facing booking moments, celebrations, Gen UI streaming     | `spring`, `springGentle`, `springTilt`, `staggerReveal`, `boop`, and the signature instruments (FlipDot, NeonSign, Ferrofluid, SplitFlap, Handshake, SilkFlow).    |

Staff-facing views are productive by default. A productive view may borrow one expressive moment (for example a success flourish) under the [one expressive element](#5-restraint-rules) rule.

## 4. Duration and easing

| Need                  | Value                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Micro (hover, icon)   | `--rialto-duration-fast` 100ms                                                                 |
| Standard state change | `--rialto-duration-standard` 150ms                                                             |
| Deliberate (panel)    | `--rialto-duration-slow` 200ms                                                                 |
| Expressive            | A spring (`spring`, `springGentle`). Springs set their own settle time; do not add a duration. |
| Ceiling               | UI transitions top out near 300ms. Nothing blocks input while it runs.                         |
| Exits                 | 50 to 100ms shorter than the matching entrance, and never blocking.                            |
| Distance and size     | Duration grows with distance travelled and element size; keep travel under 16px in productive. |

Easing:

- **Entering** elements decelerate. `--rialto-ease-precision` (`cubic-bezier(0.2, 0, 0, 1)`) is already a strong decelerate curve; use it for entrances and on-screen moves.
- **Exiting** elements may use `--rialto-ease-smooth` or simply fade, shorter than the entrance.
- Springs are for the expressive tier only.

### Decision: no new tokens

The issue asked whether to add an expressive duration step (300 to 400ms) and enter/exit easing tokens (compare Material 3 emphasized-decelerate and emphasized-accelerate). **Decision: not now. No tokens are added, so no ADR.**

- Expressive motion is spring-driven. A spring has no authored duration, so a 300 to 400ms token would be unused by the tier it is meant for.
- `--rialto-ease-precision` already decelerates sharply and covers enter; exits are covered by a shorter duration plus `--rialto-ease-smooth` or a fade.
- Every added token is a surface the vibe adapter and reduced-motion adapter must also collapse. A new token needs a component that cannot be built without it.

Revisit when a CSS-driven (non-framer) expressive entrance needs a duration, and write an ADR then. The audit below lists the components that would be the first consumers.

## 5. Restraint rules

- **One expressive element per view at a time.** A second one waits or does not animate.
- **No looping motion in task UI** except status (live, LED, loading). Decorative loops pause when offscreen or after a bounded number of cycles.
- **Never scale from 0.** Start at 0.9 or above, together with opacity. Press feedback is subtle: scale 0.97 to 0.98.
- **Animate only `transform` and `opacity`.** Layout changes go through framer's `layout` prop.
- **No parallax and no auto-scroll** in staff tools.
- **Stagger at most about 6 items**, then reveal the rest as one batch.
- **Disabled elements have no motion.**
- **Nothing blocks input** while it animates.

## 6. Signature moments

Delight is chosen, not sprinkled. These are the planned moments; adding another needs a purpose from [§ 1](#1-the-purpose-test) and a frequency of "rare".

| Moment                                 | Instrument                                           | Tier       |
| -------------------------------------- | ---------------------------------------------------- | ---------- |
| Booking confirmed (guest)              | SplitFlap or FlipDot settle on the confirmation      | Expressive |
| Venue goes live                        | NeonSign switching on (single warm-up, then at rest) | Expressive |
| Gen UI element streaming in            | `spring` settle, one element at a time               | Expressive |
| Marketing hero                         | `Hero` with `staggerReveal`, once per page load      | Expressive |
| Empty to first data                    | One `springGentle` entrance                          | Expressive |
| Waitlist or table status change (live) | StatusLED (status loop is allowed)                   | Productive |

## 7. Accessibility

- `useMotionPreset()` and the reduced-motion vibe adapter already handle `prefers-reduced-motion`: CSS duration tokens collapse to `0s`, and JS configs collapse to `{ duration: 0 }` (springs are dropped, not shortened). See [vibes.md](./vibes.md#the-reduced-motion-adapter).
- Reduced motion swaps **movement** for an opacity change or an instant change. It never removes the **information** the motion carried: a toast that slid in still appears, a selected tab still shows it is selected.
- WCAG 2.2.2 Pause, Stop, Hide: auto-playing motion longer than 5 seconds needs a way to stop it. Decorative loops must pause (offscreen, after N cycles, or on request).
- WCAG 2.3.1 Three Flashes: nothing flashes more than 3 times a second. FlipDot and SplitFlap boards must not cascade faster than that.
- WCAG 2.3.3 Animation from Interactions: motion triggered by interaction can be disabled; the reduced-motion path above is that mechanism.
- Read the preference through `motionPreset.reduced`, never framer's `useReducedMotion()`.

## 8. Do and don't

| Do                                                         | Don't                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Open the command palette instantly.                        | Slide and scale the command palette on every Cmd+K.                |
| Fade and lift a toast 8px with `precision`.                | Spring a toast in from 80px away on every table update.            |
| Give a hover a colour change within 100ms.                 | Boop-scale every button on hover in a dense staff table.           |
| Spend one `staggerReveal` on the booking-confirmed screen. | Stagger forty rows, or animate three instruments in one view.      |
| Run a spinner or LED breathe for loading and live status.  | Loop a decorative glow beside a form someone is filling in.        |
| Enter a dialog from `scale: 0.97` with opacity.            | Enter a chip from `scale: 0`.                                      |
| Resolve configs with `useMotionPreset()`.                  | Hand-build `shouldReduceMotion ? { duration: 0 } : ...` fallbacks. |

## 9. Component audit

Verdicts as of this policy. **Keep** means it already fits its tier. **Trim** means a follow-up issue changes it. No component is changed by the PR that introduced this page. "Loop" means the component runs motion with no end.

| Component or group                                                                                  | Tier       | Verdict  | Note                                                                                              |
| --------------------------------------------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------- |
| Dialog, Drawer, Popover, HoverCard, Toast, Banner, Alert, Collapsible, AppBar, Sidebar              | Productive | Keep     | Occasional, fade and short travel, scale at or above 0.96.                                        |
| DropdownMenu, ContextMenu, NavigationMenu, Tooltip, Select, Combobox, Autocomplete                  | Productive | Keep     | Tens per day; short fade with scale 0.95, close to the floor. Keep, never deepen.                 |
| CommandPalette                                                                                      | Productive | **Trim** | Opens 100+ times a day; scales and slides on enter. Should be instant or opacity only.            |
| Button, Toggle, Checkbox, Pagination, SegmentedControl, Tag: hover `boop`                           | Expressive | **Trim** | Hover scale 1.03 on tens-per-day controls. Keep press (0.975); make hover colour only.            |
| Tabs, Slider, SegmentedControl indicator, Sidebar and Tree chevrons, Navbar toggle, Meter, Progress | Productive | Keep     | Indicator and state motion, precise and short.                                                    |
| PinInput (scale 0.6), Tag (scale 0.8), Checkbox mark (scale 0)                                      | Productive | **Trim** | Violate the never-scale-from-0 floor (0.9). Start at 0.9 or above with opacity.                   |
| Skeleton, Progress shimmer/trace, Button and Combobox spinners, StatusLED, WatchLoader              | Productive | Keep     | Status loops (loading, live) are allowed.                                                         |
| NeonSign breathe, Handshake shuttle, Ferrofluid (`repeat: Infinity`)                                | Expressive | **Trim** | Decorative loops: confirm they pause offscreen or after N cycles (WCAG 2.2.2); keep one per view. |
| Hero, staggerReveal, SilkFlow, SplitScreenExit, MasterOverride, ChatPanel, ImageUpload              | Expressive | Keep     | Rare or guest-facing; one expressive element per view.                                            |
| FlipDot, SplitFlap, DepartureBoard, Odometer, Avatar `splitflap` transition                         | Expressive | Keep     | Signature instruments; respect the 3-flashes rule and the one-per-view rule.                      |
| Card, Badge and other static components                                                             | None       | Keep     | No motion.                                                                                        |

Follow-ups for the **Trim** rows: CommandPalette #7810, hover boop #7811, scale floor #7812, decorative loops #7813.

## References

- [Carbon motion overview](https://carbondesignsystem.com/elements/motion/overview/) (productive and expressive)
- Material 3 easing and duration tokens
- [Atlassian applying motion](https://atlassian.design/foundations/motion/applying-motion)
- Emil Kowalski, frequency-based animation guidance
- WCAG 2.2.2, 2.3.1, 2.3.3
