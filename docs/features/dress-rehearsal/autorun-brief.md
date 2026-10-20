# Autorun brief — dress-rehearsal

Source of truth for the design: `docs/plans/2026-10-18-dress-rehearsal.md` (merged via #7049). Read it; the answers below summarise it.

- **Scale:** feature run, slug `dress-rehearsal`.
- **What and why:** after onboarding, the owner clicks "Run a Friday night" and their own floor plan and timeline play a seeded, simulated service at ~60x (bookings land, parties seat, tables cycle occupied → dirty → ready, a walk-in waits, a no-show frees a table), ending on a curtain-call summary card. Solves the empty-account cold start with no history and no LLM.
- **Problem (sufferer's view):** a new venue owner sees blank screens until real guests book, so cannot judge whether the product fits their room. Today they imagine it or read docs. (Anecdote: Matt's own observation; no real venues yet.)
- **Why now:** hospitality app has no real venues/service history; Service Replay and Snap Your Room are blocked; this is unblocked.
- **Evidence:** anecdote only (owner's product judgement, 2026-10-18); no user research. No observed users.
- **Solution hunch:** pure seeded simulator + pure reducer + playback hook, rendered through the existing prop-driven `FloorPlanCanvas` and `TimelineGrid`. Client-side only, zero API writes, no migration.
- **Success statement:** a fresh venue can run a deterministic simulated Friday night on its own floor plan, see tables and reservations animate, finish on a summary card, and the API receives zero writes.
- **Biggest unknowns / ways it dies:** simulation looks implausible/fake; simulated data mistaken for real; perf at 240x on big floors.
- **In scope:** plan steps 1–7 (simulator, reducer, playback hook, timeline + floor-plan rehearsal mode with banner, entry points, curtain-call summary), en-US/fr-CA strings, unit + guard tests, E2E (step 8).
- **Out of scope:** persisting rehearsals as `TableEvent` rows, real operatingHours/deposit simulation, shareable recordings, any migration or API write.
- **Constraints:** `apps/hospitality`; TDD; no setState in useEffect bodies in rialto code; rehearsal module must import no api-client write method (tested); reduced-motion respected; follow ADRs (incl. ADR-027 localization through context if applicable); Rialto tokens.
- **Tracker:** no issue seeding; no tracker interaction.
- **User-facing surface:** yes (`ux: required`).
- **Release authorization:** none. Prepare-and-stop; no merge, deploy, tag, or publish.
- **operate:** skip.
- **stop-after:** ship
