# Runbook: E2E Environment Recovery

The Hospitality E2E tests depend on a configured Auth0 client, live backend services, and a clean database. This runbook helps distinguish environment failures from real test breakage and recover from common drift issues.

## Quick Diagnosis: Environment vs Code

Check the CI failure artifacts first:

1. **Navigate to the failing run** in GitHub Actions
2. **Look for "Upload failure artifacts"** — this step generates `e2e-test-results/` and `playwright-report/`
3. **Examine `error-context.md`** (if present in the playwright report) — this DOM snapshot captures the actual page state when the test failed
4. **Pattern recognition:**
   - **>20% of tests failing across unrelated suites** (e.g., login fails, then booking fails, then confirmation fails) → environmental/service startup issue
   - **Isolated single-test failure** (e.g., only the "edit reservation" test fails) → likely a code/selector change
   - **Selectors missing from DOM snapshots** in error-context.md → selector drift (code changed the HTML)
   - **"Connection refused" or "503 Service Unavailable" in logs** → backend services didn't start or health checks failed

## Common Causes and Recovery

### 1. Auth0 E2E Client Misconfigured

**Symptom:** All tests fail at login with `401 access_denied` before any page loads.

**Root cause:** The `E2E_AUTH0_CLIENT_ID` secret points to a **Machine-to-Machine (M2M)** application instead of a **SPA** or **Regular Web Application**. M2M apps reject the Resource Owner Password Credentials (ROPC) grant used by E2E tests.

**Recovery:**

1. Verify the client ID in GitHub Settings > Secrets > Actions > `E2E_AUTH0_CLIENT_ID`
2. Log into Auth0 Dashboard (`https://manage.auth0.com`)
3. Go to Applications > the app tied to that client ID
4. Confirm the **Application Type** is either:
   - **Single Page Application** (current: `mattbutlerengineering-hospitality`)
   - **Regular Web Application**
   - **NOT** Machine-to-Machine
5. If changed, retrieve the new client ID and update the secret:
   ```bash
   gh secret set E2E_AUTH0_CLIENT_ID --body "<new-client-id>"
   ```
6. Ensure the secret value is **not empty** — a blank secret causes "Missing required E2E auth env vars" instead of the actual auth error

### 2. Auth0 Test User Missing or Misconfigured

**Symptom:** Login succeeds but immediately fails with "User not found" or "access denied" on an API call.

**Root cause:** The test user (seeded in Auth0 via `E2E_AUTH_EMAIL` and `E2E_AUTH_PASSWORD`) does not exist or was deleted.

**Recovery:**

1. Verify the test user exists in Auth0 Dashboard > Users
2. If missing, create a new test user with the email from the `E2E_AUTH_EMAIL` secret
3. Verify the user has no restrictions (check the **Details** tab for any account flags)
4. Verify both `E2E_AUTH_EMAIL` and `E2E_AUTH_PASSWORD` secrets are set and non-empty (use `gh secret list` to confirm presence, though values are redacted)
5. If the user was recently changed, restart the E2E test run: `gh run rerun <RUN_ID> --failed`

### 3. Backend Services Failed to Start

**Symptom:** Tests hang or fail immediately with "connection refused" or "ECONNREFUSED" when making API calls.

**Root cause:** The users-api or reservations-api did not boot, or failed after booting because the database was unreachable.

**Recovery (Local Reproduction):**

1. **Check database migrations applied correctly:**

   ```bash
   pnpm --filter @mbe/users-service db:migrate:deploy
   pnpm --filter @mbe/reservations-service db:migrate:deploy
   ```

   If this fails, the schema is out of sync — read the migration error and either roll back incompatible code or regenerate migrations.

2. **Start the backend services with logging:**

   ```bash
   # In one terminal (users-api)
   pnpm --filter @mbe/users-service dev

   # In another terminal (reservations-api)
   pnpm --filter @mbe/reservations-service dev
   ```

3. **Verify health endpoints respond with 200:**

   ```bash
   curl http://localhost:3001/api/v1/users/health
   curl http://localhost:3004/api/v1/reservations/health
   ```

   If either returns a non-200 code or connection error, the service is not listening. Check logs for startup errors.

4. **Verify database connectivity specifically:**
   - `GET /health` returns 200 even if the database is down (liveness check only)
   - `GET /api/v1/<service>/health` runs a Prisma query and returns `degraded` if the database is unreachable — this is the real readiness signal

**Recovery (CI):**
The E2E workflow runs `db:migrate:deploy` and starts services in the background before running tests. If the workflow logs show service startup timeouts in the "Wait for backend health" step, the issue is usually:

- Postgres container failed to start (check "services.postgres" step logs)
- Migration failed (check "Apply migrations" step logs)
- Service crashed immediately after starting (check "Dump backend logs on failure" step)

### 4. Database State Corruption or Stale Seed Data

**Symptom:** Tests pass locally but fail in CI; or tests that create data (e.g., bookings) fail intermittently.

**Root cause:** The database was not reset between test runs, or the test fixture/seed logic is incomplete.

**Recovery (Local Reset):**

1. Drop and recreate the test database:
   ```bash
   dropdb test  # or use psql -d postgres -c "DROP DATABASE test;"
   createdb test
   ```
2. Re-apply migrations:
   ```bash
   pnpm --filter @mbe/users-service db:migrate:deploy
   pnpm --filter @mbe/reservations-service db:migrate:deploy
   ```
3. Restart backend services and re-run tests:
   ```bash
   pnpm --dir apps/hospitality test:e2e
   ```

**Prevention (CI):**
The E2E workflow starts with a fresh Postgres container (`services.postgres` in the job definition), so database state should not leak between runs. If you see persistent state issues, check the test suite itself for:

- Missing `.clear()` or `.deleteMany()` calls after each test
- Mocks that persist across test boundaries (Playwright context isolation must be enabled)
- Seed data that assumes a clean database (prepend reset logic to the setup step)

### 5. Selector Drift (Code Changed HTML Structure)

**Symptom:** Tests fail at a specific step with "element not found" or "element not clickable"; unrelated selector changes fail different tests.

**Root cause:** A Rialto component update or Hospitality app refactor changed the HTML structure (class names, element hierarchy, data-testid values) without updating test selectors.

**Recovery:**

1. Inspect the error-context.md DOM snapshot to see what the page actually looks like at failure
2. Compare the failed selector with the current HTML — look for:
   - Renamed CSS classes
   - Removed or repositioned elements
   - data-testid attributes that changed
3. Update the selector in `apps/hospitality/e2e/` test files
4. Re-run locally to verify: `pnpm --dir apps/hospitality test:e2e`
5. Commit the selector fix alongside any code changes that triggered the drift

### 6. Stateful Mock Gaps (SSE Stubs, API Responses)

**Symptom:** Tests pass individually but fail when run as a suite; or tests hang waiting for WebSocket/SSE events that never arrive.

**Root cause:** The test mocks do not reflect the current backend behavior (e.g., missing SSE event stubs, incomplete API response shapes).

**Recovery:**

1. Check the test logs for "timeout waiting for event" or "unexpected response shape"
2. Compare the mock definition in `apps/hospitality/e2e/` with the actual API response from a running backend:

   ```bash
   # Start the backend
   pnpm --filter @mbe/reservations-service dev

   # In another terminal, trigger an API call and inspect the response
   curl -i http://localhost:3004/api/v1/reservations/...
   ```

3. Update the mock to match the actual response shape
4. For SSE events (e.g., reservation status updates), ensure the stub emits the full event payload that the frontend expects
5. Re-run the test suite in isolation: `pnpm --dir apps/hospitality test:e2e --grep "<test-name>"`

## Running E2E Tests Locally

### Prerequisites

- Node 22 (run `nvm use` — the repo pins Node 22 in `.nvmrc`)
- Postgres running (via `pnpm dev:local`, which starts Docker + schema sync)
- Auth0 test user exists and credentials are in `.env.local` (see CONTRIBUTING.md)

### Run the Full Suite

```bash
pnpm --dir apps/hospitality test:e2e
```

### Run a Single Test

```bash
pnpm --dir apps/hospitality test:e2e --grep "booking flow"
```

### Generate an HTML Report

```bash
pnpm --dir apps/hospitality test:e2e
# Opens the Playwright report automatically
```

### Debug with Headed Browser

```bash
pnpm --dir apps/hospitality test:e2e --headed
```

## Verifying the Fix

After applying a recovery step, confirm the fix by:

1. **Locally:** Run the E2E suite and watch for all tests to pass:

   ```bash
   pnpm --dir apps/hospitality test:e2e
   ```

2. **In CI:** Create a minimal PR that changes only the affected file (e.g., fixing a selector in a test file), push it, and watch the E2E job succeed.

3. **Check backend health:** Confirm both health endpoints return 200:
   ```bash
   curl http://localhost:3001/api/v1/users/health
   curl http://localhost:3004/api/v1/reservations/health
   ```

## References

- **CI Job:** `.github/workflows/e2e.yml` — the "Hospitality E2E" job
- **Test Artifacts:** `apps/hospitality/e2e/test-results/` and `apps/hospitality/playwright-report/` (uploaded on CI failure)
- **Source Code:** `apps/hospitality/e2e/` — test files and fixtures
- **Backend Health Checks:** `services/users/src/routes/health.ts` and `services/reservations/src/routes/health.ts`
