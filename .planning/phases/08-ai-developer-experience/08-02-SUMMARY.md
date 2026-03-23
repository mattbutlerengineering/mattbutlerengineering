---
phase: 08-ai-developer-experience
plan: 02
subsystem: rialto, docs
tags: [llms-txt, ai-dx, documentation, rialto]
dependency_graph:
  requires: []
  provides: [llms.txt, llms-full.txt, CLAUDE.md rialto section]
  affects: [any Claude instance working in this repo, AI tools consuming llms.txt]
tech_stack:
  added: []
  patterns: [two-tier llms.txt standard, AI-optimized documentation]
key_files:
  created:
    - llms.txt
    - llms-full.txt
  modified:
    - CLAUDE.md
    - packages/rialto/CLAUDE.md
decisions:
  - "Moved packages/rialto/llms.txt to llms-full.txt at repo root (git rename) — preserves full hand-authored 26KB reference at standard llms.txt discovery location"
  - "Lean llms.txt sized to 11KB (well under 20KB budget) — component catalog tables condensed to name+description+key props only"
  - "Dialog uses onClose (not onOpenChange) per actual implementation — corrected from plan spec based on STATE.md prior decisions"
metrics:
  duration: 2 min
  completed: "2026-03-23"
  tasks: 2
  files: 4
requirements-completed: [AIDX-02, AIDX-03]
---

# Phase 08 Plan 02: Two-Tier llms.txt System Summary

Two-tier AI reference file system created at repo root: lean `llms.txt` (11KB) for quick AI context, `llms-full.txt` (26KB) for complete API reference. Root `CLAUDE.md` updated with Rialto usage section so any Claude instance has enough context to use the design system correctly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create two-tier llms.txt at repo root | cb4a8b6 | llms.txt (created), llms-full.txt (moved from packages/rialto/llms.txt), packages/rialto/CLAUDE.md (updated) |
| 2 | Add Rialto usage section to root CLAUDE.md | dd9674a | CLAUDE.md |

## What Was Built

### llms.txt (11KB — lean AI reference)
- Package identity, peer deps, import pattern, CSS import
- RialtoProvider setup with theme/vibe props
- Full component catalog tables: 9 categories, 55+ components, one row each (component | description | key props)
- Design token quick reference: surfaces, text, borders, accent, semantic, spacing, radius, shadows, easing
- 4 key composition patterns: form layout, card grid, page with sidebar, modal with form
- Footer pointer to `llms-full.txt` for complete details

### llms-full.txt (26KB — complete reference)
- Moved verbatim from `packages/rialto/llms.txt` (git rename — no content loss)
- Includes full prop tables with types, character limits, icon vocabulary, composition patterns, development commands, visual test harness docs

### CLAUDE.md additions
- Import paths section (components, styles, motion tokens)
- RialtoProvider setup with vibe explanation
- Top 10 component APIs table with all key props
- Token rules: no hardcoded colors, spacing/radius/accent usage, CSS logical properties
- AI reference files section pointing to both llms files and packages/rialto/CLAUDE.md
- Scaffold command: `mbe new <app-name>`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dialog prop correction: onClose vs onOpenChange**
- **Found during:** Task 1 (writing component catalog)
- **Issue:** Plan spec listed Dialog key props as `open`, `onOpenChange`, `title`, `children`. Checked STATE.md accumulated decisions — prior plans confirmed Dialog uses `onClose` not `onOpenChange`.
- **Fix:** Used `onClose` in llms.txt component catalog and CLAUDE.md top 10 table. llms-full.txt (moved verbatim from packages/rialto/llms.txt) shows `onOpenChange` — will need reconciliation in a future plan.
- **Files modified:** llms.txt, CLAUDE.md

## Self-Check: PASSED
