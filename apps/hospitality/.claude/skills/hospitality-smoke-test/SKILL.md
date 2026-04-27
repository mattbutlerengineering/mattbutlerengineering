# Hospitality Smoke Test Skill

Run the E2E auth flow as a pre-deploy gate. This validates that the hospitality app's authentication flow works correctly before deploying.

## When to Use

- Before deploying to production
- Before deploying canary
- After any auth-related changes
- During `/ship-loop` pre-push phase

## Prerequisites

Set these environment variables:
- `E2E_AUTH0_DOMAIN` — Auth0 tenant domain
- `E2E_AUTH0_CLIENT_ID` — Auth0 client ID (must have Password grant)
- `E2E_AUTH0_AUDIENCE` — API audience identifier
- `E2E_AUTH_EMAIL` — Test user email (no MFA)
- `E2E_AUTH_PASSWORD` — Test user password

## Command

```bash
pnpm --dir apps/hospitality test:e2e --grep "auth"
```

## Success Criteria

- Auth flow completes without errors
- User is redirected to dashboard after login
- No console errors related to auth

## Failure Handling

If auth flow fails:
1. Check `E2E_AUTH*` env vars are set correctly
2. Verify Auth0 client has Password grant enabled
3. Check test user exists and has no MFA
4. Run `pnpm --dir apps/hospitality test:e2e` for full output