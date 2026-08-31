---
"@mattbutlerengineering/rialto": minor
---

**New `NeonSign` instrument** — visualises a venue's trading state as a neon tube spelling OPEN on a recessed housing, with the fact stated in words beneath it.

- `state` is `"open" | "opening-soon" | "closed" | "unset"` (required — a sign with no state would be a lie). `open` lights the tube with the success token and strikes on when entered; `opening-soon` warms it gold and breathes — the only place the accent appears; `closed` is dark glass on the plate; `unset` drops the tube and the plate for a dashed outline.
- Owns no clock and no timezone: the consumer derives the state and the label. Renders as `role="img"` with a required `aria-label` that is also the visible caption (`showCaption` to hide it); housing, tube and caption are `aria-hidden`.
- All motion is opacity-only CSS keyframes bound to `data-state`, so no React state or effect drives it. `prefers-reduced-motion` removes the strike and parks the breathe (`data-reduced-motion`). `size` `"sm" | "md" | "lg"`. Exposes `data-state` on the root.
