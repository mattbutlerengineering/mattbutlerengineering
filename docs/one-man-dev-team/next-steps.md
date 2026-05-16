# Next Steps — Restaurant Booking Platform

**Last session:** 2026-02-25
**Status:** All code scaffolded, CI green, pushed to GitHub. App runs locally but needs Supabase to function.

---

## Pick Up Here (in order)

### 1. Create Supabase Project (~5 min)
- Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project
- Open the SQL Editor and run the three migrations in order:
  1. `supabase/migrations/001_create_tables.sql` — tables, indexes, triggers
  2. `supabase/migrations/002_rls_policies.sql` — row level security policies
  3. `supabase/migrations/003_availability_rpc.sql` — availability + booking RPC functions

### 2. Configure Environment (~2 min)
- Copy your project URL and anon key from Supabase → Settings → API
- Update `.env.local`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
  ```
- Run `npm run dev` and verify the landing page loads without errors

### 3. Test Auth Flows (~10 min)
- Sign up as a diner at `/signup/diner`
- Sign up as a restaurant owner at `/signup/restaurant` (creates profile + restaurant)
- Log in/out with both accounts
- Verify role-based redirects (diner → `/`, owner → `/dashboard`)

### 4. Test Booking Flow (~10 min)
- As restaurant owner: add time slots at `/dashboard/slots`
- As diner: search by city on landing page → click restaurant → pick slot → confirm booking
- Verify booking appears in `/bookings` (diner) and `/dashboard/bookings` (owner)
- Cancel a booking from both sides

### 5. Add Seed Data (~10 min)
- Edit `supabase/seed.sql` with demo restaurants, slots, and bookings
- Or create them manually through the restaurant owner signup flow

### 6. Deploy to Vercel (~5 min)
- Run `vercel` or connect the GitHub repo at [vercel.com](https://vercel.com)
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables
- Deploy and verify

---

## What's Built

| Layer | Status |
|-------|--------|
| Database schema (4 tables + RLS + RPC) | Done — needs Supabase project |
| Auth (login, diner signup, restaurant signup) | Done |
| Diner pages (landing, search, detail, bookings) | Done |
| Restaurant dashboard (overview, edit, slots, bookings) | Done |
| Navigation header | Done |
| CI/CD (GitHub Actions: lint, test, build) | Done |
| Tests (10 unit tests, all passing) | Done |

## Key Files

- `docs/plans/2026-02-25-restaurant-booking-platform-design.md` — full design doc
- `docs/plans/2026-02-25-restaurant-booking-implementation.md` — 28-task implementation plan
- `CLAUDE.md` — project conventions for AI agents
- `TODO.md` — task tracking
- `supabase/migrations/` — database migrations (run in order)

## Known Issues

- Next.js 16 shows a deprecation warning for `middleware.ts` (recommends `proxy` convention) — works fine, migration deferred
- Middleware skips Supabase session refresh when env vars are missing (intentional for local dev without Supabase)
