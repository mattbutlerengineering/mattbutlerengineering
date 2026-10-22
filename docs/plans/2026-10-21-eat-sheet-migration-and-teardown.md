# eat-sheet — migrate the remaining delta, then tear it down

> **Status: active.** Phase 0 complete (this document + the source mirror). Phase 1 issues
> are filed from the delta table below. Phase 3 is **human-only** and explicitly destructive.
> Facts verified against `origin/main` at `7149ded79` and against live infrastructure on
> 2026-10-21/22.

## Context

eat-sheet was retired on 2026-10-18 and its menu features were rebuilt in hospitality
across #7067–#7073 (all closed; tracking #7074 open).

**That port was scoped from the wrong codebase.** The clone at
`/Users/mbutler/Projects/eat-sheet.com` is a retired 2025 AWS/Rush generation (last commit
2025-10-14) — a read-only guest menu viewer, never deployed. The GitHub remote of the same
name was later **replaced** by a Cloudflare Workers + Vite rewrite (pushed 2026-04-28, 442
files, 31 open issues) which is **live at eat-sheet.com today** and contains **no menus at
all**. It is a parallel hospitality product: venues, a 6-step onboarding wizard, a
floor-plan editor, guests, metrics, Google auth.

So the question "what is left to migrate" had never actually been asked of the live
codebase. This document answers it.

### What was verified

| Fact                                              | Evidence                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| eat-sheet.com serves the rewrite                  | `200`; `<title>Eat Sheet</title>`; deployed bundle routes `/`, `/login`, `/onboarding`, `/floor-plan`, `/guests`                                                                                        |
| It is a Worker in the **same** Cloudflare account | its `wrangler.toml`: worker `eat-sheet`, routes `eat-sheet.com/*`, `www.eat-sheet.com/*`                                                                                                                |
| It owns live Cloudflare state                     | D1 `eat-sheet-db` (`a606f1f7-605f-4f8e-9c5d-9e3b1a789752`), R2 `eat-sheet-logos`                                                                                                                       |
| This repo actively protects it                    | `infrastructure/resource-allowlist.json` → `eat-sheet`, reason _"never delete"_; `scripts/preview-worker-sweep.mjs` and its tests pin it as unsweepable                                                 |
| The Menus port is live in production              | prod `reservations-api` sha `b3081e862` carries `routes/menus.ts` + `routes/public-menus.ts`; migration commit `ef94849d2`'s deploy run `39158315715` shows `Deploy API Services: success` (not skipped) |
| …including the UI                                 | prod bundle `/hospitality/assets/index-BI4JBAsN.js` contains `menu/:venueSlug`, `menu/:venueSlug/:menuSlug`, `menus`, `menus/:menuId`                                                                   |
| Nothing of value sits in eat-sheet's AWS          | acct `193884054319`: Cognito `us-east-1_HAkQVaB0z` (dev) **0 users**, `us-east-1_oDqalvOSU` (staging) **0 users**, S3 `eat-sheet-images-staging` **0 objects**; no Route53 zone, CloudFront, Lambda, RDS |
| The domain is a standing cost                     | `eat-sheet.com` — Squarespace Domains, expires **2027-04-18**, DNS on Cloudflare                                                                                                                       |

### Why teardown is not blocked by the migration

An archived GitHub repository stays fully readable, and Phase 0 took a complete local
mirror on top of that. The only irreversible losses in a teardown are D1 rows, R2 objects,
and the domain. So Phase 3 can run in parallel with Phase 1 rather than after it — the
feature work reads from the mirror, not from live infrastructure.

**The source of truth for every port below is the mirror**, not the stale clone:

```
git --git-dir=/Users/mbutler/Projects/eat-sheet-mirror-2026-10-21.git show main:<path>
```

## The delta

Checked against `services/reservations/prisma/schema.prisma`,
`packages/types/src/schemas/floor-plan.ts`,
`apps/hospitality/src/components/floor-plan/`, and
`apps/hospitality/src/components/venue-onboarding/`.

| eat-sheet source                                                                                                        | Hospitality today                                                               | Verdict                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- |
| `layout_data.walls` — `WallLayout{x1,y1,x2,y2,thickness,wallType:wall\|window}`; `components/WallShape.tsx` (158 lines) | `FloorPlanLayoutSchema` = `{width,height,backgroundImage?,gridSize?,showGrid?}` | **port** — walls absent      |
| `floor_plan_sections{name,color,floor_material}`; `components/SectionZone.tsx` (145 lines); `floor_plan_tables.section_id` | no section entity, no table→section link                                        | **port** — sections absent   |
| 5 floor textures `carpet/concrete/hardwood/marble/tile.png`; `hooks/useTextures.ts` (77 lines); migration `003_section_floor_material.sql` | nothing                                                                         | **port** — materials absent  |
| 7 furniture SVGs `booth, chair, bar-stool, place-setting, table-rect, table-round, table-square`                         | `TableShape.tsx` draws bare rects and circles                                   | **port** — art absent        |
| `shared/templates/floor-plan.ts` (340 lines) — 7 templates × 4 sizes; `TemplatePicker`, `TemplateMiniPreview`            | `NewFloorPlanDialog` creates a blank `CANVAS_WIDTH × CANVAS_HEIGHT` canvas      | **port** — templates absent  |
| `tenants.type (fine_dining\|casual\|bar\|cafe)`, `cuisines[]`, `address_*`, `website`                                   | `Venue` has name, slug, timezone, currency, hours, settings, deposit only       | **port** — profile absent    |
| `venue_themes{accent,accent_hover,surface,surface_elevated,text_primary,source}`; `VenueTheme.tsx`, `ThemePreview`, `ColorSwatch` | no per-venue theme                                                              | **port** — theme absent      |
| `server/features/venues/color-extraction.ts` (211 lines) — k-means palette, unit-tested                                 | nothing                                                                         | **port** — extraction absent |
| R2 logo upload (`StepLogo`, bucket `eat-sheet-logos`), `tenants.logo_url`                                               | no upload path anywhere in the repo                                             | **dropped** — see below      |

The 7 templates are `Blank`, `Fine Dining`, `Casual Bistro`, `Bar & Lounge`, `Café`,
`Banquet Hall`, `Open Kitchen`; the 4 sizes are `Cozy` (800×600), `Standard` (1200×800),
`Spacious` (1600×1000), `Grand` (2000×1200).

### Deliberately not migrated

Hospitality already equals or beats these:

- **Guests** — hospitality adds no-show counts, lifetime spend, dietary restrictions, staff
  notes, communication preference, Stripe customer linkage.
- **Auth** — Auth0 (which can offer Google as a connection) over eat-sheet's Google-only.
- **Roles** — `VenueRole` + `VenueMembership` over `roles`/`tenant_members`.
- **Onboarding shell** — hospitality runs Welcome → BasicInfo → LocationTime →
  OperatingHours → Settings → FloorPlan → Launch with a `StepIndicator` and
  `LaunchStagePanel`; eat-sheet has 6 simpler steps. Only its **Brand** and **Logo** steps
  have no counterpart, and those are covered by the theme and extraction items.
- **Metrics** — `metrics/daily` plus the ACMM plugin.
- **Venue delete** — `services/reservations/src/routes/venues.ts:828`.
- **Menus** — already ported and live.
- **eat-sheet's 31 open issues** — ACMM governance scaffolding plus roadmap items
  hospitality already has or already has plans for. Nothing to transfer; archival freezes
  them readable.

### Logo storage is dropped, not deferred

**No new infrastructure dependency may be introduced for this migration** (Owner decision,
2026-10-21). Object storage for the logo file itself is therefore out of scope entirely —
not filed, not queued.

This does not block the brand feature, because the two halves separate cleanly:

- **Palette extraction needs no storage.** eat-sheet decodes PNG/JPEG server-side with
  `upng-js` and `jpeg-js` only because it runs inside a Worker. In hospitality the operator
  already has the file in the browser, so the pixels come from a `<canvas>`
  `getImageData` — **no new dependency of any kind**, and the k-means core ports verbatim.
- **Only the resulting palette is persisted**, into `Venue.settings.theme`. No migration,
  no bucket, no upload route, no credential.

Consequently `MBE_CLOUDFLARE_API_TOKEN`'s scopes (Zone:DNS:Edit, Zone:Zone:Read,
Account:Cloudflare Pages:Edit, Account:Workers KV Storage:Edit per `docs/SECRETS.md` —
note: **no R2 permission**) are never exercised by this work, and the class of failure
behind `.claude/reflections/RCA-PR-4924.md` (a Pulumi resource whose live credential lacks
the scope, which no pre-merge gate can catch) cannot occur here.

If venue logos are ever wanted, that is a separate decision with its own infrastructure
conversation. Until then the theme is palette-only, exactly like the Marquee plan's
typographic hero.

## Work items

Filed as `ready` issues under one tracking issue, labelled `feature` plus the relevant
`area:*`. Each cites its eat-sheet source path.

**No dependencies — these go first:**

| #     | Item                     | Shape                                                                                                                                                                                                                                      |
| ----- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | Furniture art            | Copy the 7 SVGs to `apps/hospitality/src/components/floor-plan/assets/`; render by `shape` + capacity in `TableShape.tsx` instead of bare primitives. Feeds `docs/plans/2026-10-18-room-in-3d.md`.                                        |
| **B** | Venue profile fields     | `type`, `cuisines[]`, `address{line1,line2,city,region,postalCode,country}`, `website` at `Venue.settings.profile` — **no migration**, as `docs/plans/2026-10-18-the-marquee.md` §1 specifies. Editor in `SettingsPage.tsx`; widen `PublicVenueConfigSchema` + `getPublicConfigBySlug` behind an allow-list. Supersedes Marquee steps 1–2. |
| **C** | Venue theme              | `VenueThemeSchema{accent,accentHover,surface,surfaceElevated,textPrimary,source:extracted\|manual}` at `Venue.settings.theme`; a `VenueTheme` provider overriding rialto tokens; `ColorSwatch` + `ThemePreview`; manual hex entry. Contrast is a gate, not a hope — follow `PublicMenu.contrast.test.ts`. |
| **D** | Logo → palette           | Port the pure k-means core of `server/features/venues/color-extraction.ts` (sampling stride, alpha/near-white/near-black filters, centroid fit, palette → theme mapping) and its tests. Pixels come from a browser `<canvas>`; **no new dependencies**, no upload, no storage. Writes the palette from C.                                  |

**Ordered after those:**

| #     | Item            | Shape                                                                                                                                                                                                                                                                                                      |
| ----- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **E** | Walls           | Add `walls: WallLayout[]` to `FloorPlanLayoutSchema`; `WallShape` renderer plus a draw/edit affordance in `FloorPlanCanvas.tsx`. `layout_json` is already `Json`, so **no migration**.                                                                                                                      |
| **F** | Sections        | New `FloorPlanSection` model (`venueId`, `floorPlanId`, `name`, `color`) and `Table.sectionId`, plus `sections: SectionLayout[]` in the layout; `SectionZone` renderer. **Needs ADR-026 RLS**: `ENABLE` + `FORCE`, a `FOR ALL` policy on `venue_id = current_setting('app.venue_id', true)` as both `USING` and `WITH CHECK`, grant to `app_reservations`, and new `rls-route-sweep.fixtures.ts` entries. Copy the `20261018000000_add_menus` migration as the template. Supersedes `docs/plans/2026-10-18-section-painter.md`. |
| **G** | Floor materials | `floorMaterial` enum on `FloorPlanSection` plus the 5 textures and `useTextures.ts`. Put the PNGs in `apps/hospitality/public/floor-plan/textures/` and reference them by URL — **not** bundled, or they land in the JS budget, which was only just re-baselined to ~16–18% headroom.                      |
| **H** | Templates       | `templates.ts` + `TemplatePicker` into `NewFloorPlanDialog`, `TemplateMiniPreview` into `FloorPlanStep`. Last, because the templates contain walls and sections. eat-sheet's version imports `nanoid`; use the repo's existing id generation instead of adding a dependency.                                 |

Every item: TDD (failing test first), i18n keys in **all three** catalogs (`en-US`,
`fr-CA`, `es-MX`), axe coverage on new UI, and the `local-ci-precheck` steps before the
first push.

## Phase 2 — repo-side deprecation

Agent work, once the Worker is gone:

- `infrastructure/resource-allowlist.json` — drop the `eat-sheet` worker entry, keep
  `butler-api`.
- `scripts/preview-worker-sweep.mjs` and `scripts/__tests__/preview-worker-sweep.test.mjs` —
  remove the eat-sheet comments and fixtures. Order does not matter for safety:
  `parsePreviewWorkerName` only matches `mbe-preview-<digits>-<app>`, so `eat-sheet` was
  never deletable by the sweep; the allowlist entry only suppressed an audit warning.
- `scripts/__tests__/sentry-heartbeat-targets.test.mjs` — its "never includes eat-sheet"
  assertions stay correct either way; touch only if the Sentry project is deleted.
- Close #7074 with its two human items checked off.

## Phase 3 — teardown (Owner only, destructive)

Never an agent action.

**Cloudflare** — export D1 first if any row matters, then delete worker `eat-sheet`, D1
`eat-sheet-db`, R2 bucket `eat-sheet-logos`, and the `eat-sheet.com` routes or zone.
`wrangler` cannot authenticate non-interactively here, so this is dashboard or
`wrangler login` work.

**AWS acct `193884054319`** — `pulumi destroy` the eat-sheet `dev` and `staging` stacks,
removing Cognito `us-east-1_HAkQVaB0z` and `us-east-1_oDqalvOSU` and S3
`eat-sheet-images-staging`. All three measured empty on 2026-10-21, so nothing is lost.
Then **revoke the `eat-sheet-deploy` IAM access key** — a long-lived key for that account
is active on this machine.

**Neon** — delete or pause the project behind `ep-quiet-breeze-advyb5iy-pooler…` and
**rotate `neondb_owner`**. Plaintext copies of that connection string sit in untracked
local files under the stale clone (`apps/backend/.env`,
`.claude/settings.local.json`). Nothing leaked to git, but rotate before that directory is
shared or removed.

**Also** — retire the `eat-sheet` Sentry project; decide the domain (redirect to
mattbutlerengineering.com, park, or let it lapse 2027-04-18); **archive, never delete**,
`mattbutlerengineering/eat-sheet.com`; remove the 1.7 GB stale clone at
`/Users/mbutler/Projects/eat-sheet.com` now that the mirror exists.

## Verification

- **Production menus** — already confirmed above. The remaining gap is data, not code:
  production has **no venue**, so the operator → QR → guest loop has never been walked with
  real records. Seed one venue and walk it.
- **Per item** — `pnpm --dir <pkg> test`, `pnpm typecheck` (vitest does not typecheck), the
  `local-ci-precheck` steps, and `pnpm --dir apps/hospitality test:e2e`, which runs the
  whole Playwright config so a new spec is picked up without workflow edits.
- **Floor-plan visuals** — after A, E, F and G, check whether
  `apps/hospitality/e2e/screenshots/*` or any rialto-web visual baseline moved. Regenerate
  baselines **only** from a Linux CI artifact, never from macOS.
- **Teardown** — afterwards `curl -I https://eat-sheet.com` stops serving the app,
  `aws cognito-idp list-user-pools` and `aws s3 ls` in acct `193884054319` come back empty,
  and `pnpm repo-audit` passes with the allowlist entry gone.
