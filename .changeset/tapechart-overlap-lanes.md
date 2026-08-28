---
"@mattbutlerengineering/rialto": minor
---

**TapeChart: overlapping reservations now render as per-row lanes with a classified overlap state** (backfilled for #4442 / `e4c30808`, which shipped without a changeset)

- New public `classifyOverlap?: (a, b) => TapeChartOverlapKind` prop decides whether two reservations whose visible spans overlap in one room are a `"conflict"` or `"shared"` occupancy. Called once per overlapping pair, earlier start first. Default: every overlap is a conflict. Cancelled and no-show reservations never reach the classifier.
- Every positioned bar gains an `overlap?: TapeChartOverlapKind` field — the worst kind across every pair the bar belongs to (`conflict` beats `shared`), absent when the bar overlaps nothing. Rendered as `data-overlap` and `data-lane` / `--tapechart-bar-lane` on the bar; rows expose `data-lane-count` / `--tapechart-lane-count`.
- New `overlapLabels` strings (default `{ conflict: "Double-booked", shared: "Shared occupancy" }`, deep-merged like `statusLabels`); `TapeChartFormattedParts` gains `overlapLabel`, spoken right after the status in the default reservation aria template.
- Row-height behavior change: a room whose reservations overlap now grows by one lane pitch per extra lane (derived `--tapechart-lane-pitch`), so overlapping bars sit in their own lanes instead of stacking on top of each other. One-lane rows are pixel-identical to before. Conflict bars get the error-family tint, a red inline-start edge, and a 12px conflict glyph before the title.
