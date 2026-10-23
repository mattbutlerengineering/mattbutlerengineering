# eat-sheet source, vendored for the migration

Reference-only copies of source files from the retired **eat-sheet** project, kept here so
the remaining migration issues can be worked from **any** session — including a cloud
session, which cannot reach a path on the Owner's laptop.

**Nothing in this directory is compiled, linted, type-checked, tested, bundled or shipped.**
It exists to be read and ported from, and it should be deleted once the migration closes.

## Why it is here

eat-sheet is being retired and the features hospitality lacks are being ported in — see
[`docs/plans/2026-10-21-eat-sheet-migration-and-teardown.md`](../../plans/2026-10-21-eat-sheet-migration-and-teardown.md)
and tracking issue #7257.

The migration issues originally cited a `git clone --mirror` on the Owner's machine. That
works for a local session and fails for every other kind: on 2026-10-22 the
`mbe-feature-drain` routine correctly refused issue #7254 rather than guess, because its
acceptance criteria require porting a k-means implementation **verbatim in behaviour**
(sampling stride, alpha threshold, near-white and near-black cutoffs, iteration count,
palette ordering) and the source was unreachable from a cloud checkout. Guessing those
constants would have silently broken the requirement. Vendoring the files removes the whole
class of problem.

## Provenance

Every file is a byte-for-byte copy from the eat-sheet mirror at `main` (`7853f09`), taken
2026-10-22, and verified by sha256 against the mirror after copying. Paths below mirror
eat-sheet's own layout, not this repo's.

| File                                                          | Ported by                     |
| ------------------------------------------------------------- | ----------------------------- |
| `src/server/features/venues/color-extraction.ts`              | #7254 — logo → palette        |
| `src/client/features/floor-plan/hooks/useTextures.ts`         | #7255 — floor materials       |
| `src/client/features/floor-plan/textures/*.png` (5)           | #7255 — floor materials       |
| `src/server/db/migrations/003_section_floor_material.sql`     | #7255 — floor materials       |
| `src/shared/templates/floor-plan.ts`                          | #7256 — floor-plan templates  |
| `src/client/features/floor-plan/components/TemplatePicker.tsx` | #7256 — floor-plan templates |
| `src/client/features/onboarding/components/TemplateMiniPreview.tsx` | #7256 — templates       |
| `src/client/features/floor-plan/components/SectionZone.tsx`   | #7253 — floor-plan sections   |
| `src/shared/types/floor-plan.ts`                              | #7253, #7255, #7256 — shared types |

The original project is the Owner's own private repository, so there is no third-party
licence to carry.

## Two deliberate deviations from verbatim

1. **Test files are renamed.** eat-sheet's `*.test.ts` files are stored here as
   `*-tests.ts.txt`. `scripts/check-orphaned-tests.mjs` enforces that every `*.test.*` file
   in the repo lives under a workspace package whose `test` script actually runs it, and its
   allowlist is deliberately empty — a vendored test would either trip that guard or force an
   allowlist entry that makes the guard weaker for everyone. Renaming keeps the guard honest.
   **The file contents are unmodified**; only the names differ.
2. **This directory is in `.prettierignore`.** Prettier would reformat these files, which
   would destroy the one property that makes them useful. The exclusion is what keeps
   "verbatim" true.

## How to port from here

Read the file, port the behaviour, and write the tests fresh in the destination package
(TDD — a failing test first). The vendored `*-tests.ts.txt` files are a **behavioural
reference**, not something to copy in: they are written against eat-sheet's own harness and
module layout.

Two constraints apply to every port in this migration and are easy to violate by copying:

- **No new dependency, npm or infrastructure** (Owner decision, 2026-10-21). In particular
  `color-extraction.ts` imports `upng-js` and `jpeg-js` only because eat-sheet runs inside a
  Cloudflare Worker, which has no image decoder. Hospitality does not have that constraint —
  the operator already holds the file, so pixels come from a browser `<canvas>` and neither
  decoder is needed. Port the pure k-means core, not the imports.
- `templates/floor-plan.ts` imports `nanoid`. Use this repo's existing id generation instead.
