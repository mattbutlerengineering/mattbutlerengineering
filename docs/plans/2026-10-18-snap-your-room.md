# Snap Your Room — feasibility check + build plan

> **Status: future plan — blocked.** Needs an Anthropic API key in production (`ANTHROPIC_API_KEY` for the agent service), which does not exist yet (2026-10-18). Nothing here is filed as an issue. To start it, run the accuracy spike in step 0 first. File references verified against `main` at `91f37191b`, 2026-10-18.

## Context

Matt has no venue history yet, so Service Replay (needs `table_events` history) waits. Alternative "wow" feature: during onboarding, a manager uploads a photo / PDF / sketch of their dining room and Claude vision turns it into a draft floor plan in ~10s. Kills the tedious one-table-at-a-time `FloorPlanStep`, wows on minute one, needs zero history. Task: double-check it's buildable on the current codebase (verified against `origin/main`).

## Verdict: feasible, no schema change, no storage

Onboarding already holds a **client-side draft** and only persists at Launch. AI output can drop into that same draft, so canvas, edit, remove, Launch, resume all work unchanged.

| Piece                                                                                         | Exists?                                                        | Where                                                                     |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Draft table model `{localId,name,capacity,minCovers,shape,x,y}` (centre coords, grid-snapped) | yes                                                            | `apps/hospitality/src/components/venue-onboarding/floor-plan-draft.ts:31` |
| Template → draft replace path (`SET_TEMPLATE`, pristine replace-confirm)                      | yes — copy pattern                                             | `useOnboardingWizard.ts:234`, `FloorPlanStep.tsx:96`                      |
| Canvas 800×600, `GRID_SIZE` 20, `snapToGrid`, `SHAPE_DEFAULTS`                                | yes                                                            | `floor-plan/floor-plan-geometry.ts:15-39`                                 |
| Launch creates plan + tables (resumable, dup-name tolerant)                                   | yes                                                            | `launch-sequence.ts:211-263`                                              |
| Shape zod schema                                                                              | yes                                                            | `packages/types/src/schemas/floor-plan.ts:3` (`TableShapeMetadataSchema`) |
| Authed, per-user rate-limited, cost-logged LLM route factory                                  | yes                                                            | `services/agent/src/routes/gen-route-factory.ts`                          |
| AI SDK + `@ai-sdk/anthropic`                                                                  | yes                                                            | `services/agent/package.json:26`                                          |
| Image input to model                                                                          | **no** — new                                                   | messages typed `content: string` only                                     |
| Structured output (`generateObject`)                                                          | **no** — new                                                   | only tool-call schemas today                                              |
| Upload / bodyLimit > 1MB                                                                      | **no** — Fastify default 1MB                                   | `packages/service-bootstrap/src/create-service-app.ts:159`                |
| Object storage                                                                                | **no** — not needed (process in memory, discard)               |                                                                           |
| Bulk table create                                                                             | **no** — not needed for v1 (Launch loops; fine for ~30 tables) |                                                                           |

## Approach

### 0. Accuracy spike (gate — do first, throwaway)

Script in scratchpad: 10 dining-room images (photos, PDF exit plans, sketches) → Claude vision `generateObject` with the schema below → score table count / shape / seat accuracy by hand. **Go if ≥ ~60% tables usable; else pivot** (theme studio runner-up). Also picks the model (compare current Sonnet vs Opus on cost/accuracy) and resolves whether `GEN_MODEL_ID = "claude-haiku-4.5"` (`gen-stream.ts:12`, dotted id) is even a valid API id.

### 1. Detection schema — `@mbe/types`

`DetectedTableSchema`: `{ shape: rectangle|square|circle, cx: 0..1, cy: 0..1, seats: int 1..20, label?: string, confidence: 0..1 }`, plus `{ tables: DetectedTable[] (max ~80), notes?: string }`. Normalized coords so model never has to know the 800×600 canvas.

### 2. Endpoint — `services/agent/src/routes/floor-plan-detect.ts`

- `POST /api/gen/floor-plan-detect`, body `{ venueId?, image: { mediaType: image/jpeg|png|webp, data: base64 } }`, zod-validated, route `bodyLimit` ~5MB.
- `requireAuth` + per-user `config.rateLimit` (copy `gen-ui.ts:129` pattern, e.g. 10/hour). Pre-venue (onboarding has no venue yet) → key on user, not venue.
- `generateObject({ model, schema, messages:[{role:user, content:[{type:image,…},{type:text, prompt}]}] })`; non-streaming JSON response; `logGenCost`; upstream error → 502 per existing factory behaviour. Image never persisted.
- Likely sibling to `createGenRoute` rather than through it (factory is streaming/text-shaped); reuse its auth/rate-limit/cost helpers.

### 3. Pure mapper — `venue-onboarding/detected-to-draft.ts`

`detectedToDraftTables(detected) → DraftTable[]`: scale to 800×600 with margin, `snapToGrid`, clamp in bounds, nudge collisions using `SHAPE_DEFAULTS` footprints, names `T1..Tn` (unique), `capacity=seats`, `minCovers=max(1, seats-2)`. Heavy unit tests — this is where correctness lives.

### 4. Wizard wiring

- Reducer action `SET_DETECTED_TABLES` mirroring `SET_TEMPLATE` (same pristine replace-confirm).
- `FloorPlanStep`: new "Snap your room" card beside templates → file input (`accept="image/*,application/pdf"`, `capture` on mobile) → client downscale to ≤1568px long edge JPEG (canvas) → `api` call → staggered table reveal animation → low-confidence tables highlighted for review → existing canvas editing.
- PDF: v1 renders page 1 to image client-side, or v1 = images only (decide after spike).
- Failure/empty → friendly message + templates/manual still there (no dead end). i18n strings in `en-US.json` / `fr-CA.json`.
- api-client: `api.floorPlans.detect(...)` (or agent client) in `packages/api-client`.

### 5. Edge / infra

Confirm Cloudflare Worker (`infrastructure/worker/origin-proxy.js`) passes a ~5MB POST to agent service. `ANTHROPIC_API_KEY` already configured for agent.

### Out of scope v1

Persisting width/height/rotation (draft drops them; defaults fine), sections (only free-text `Table.location`), bulk create endpoint, storing photo as `layoutJson.backgroundImage` (nice v2 — "trace over your photo").

## Delivery

After spike passes: `/decompose` into ordered issues — (1) schema, (2) endpoint, (3) mapper, (4) api-client, (5) wizard UI + reveal animation, (6) E2E with mocked detect response. TDD each.

## Verification

- Spike scorecard committed to `docs/features/snap-your-room/spike.md`.
- Unit: mapper (bounds, snapping, collisions, naming), endpoint (auth 401, rate limit 429, oversize 413, bad media type 400, model error 502, mocked `generateObject` happy path).
- E2E (Playwright, hospitality): upload fixture image with mocked detect route → tables appear → drag one → Launch → tables created.
- Manual: real phone photo on deployed preview; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `/local-ci-precheck` before push.
