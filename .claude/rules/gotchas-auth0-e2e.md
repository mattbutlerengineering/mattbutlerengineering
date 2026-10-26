---
paths:
  - "apps/*/e2e/**"
  - "infrastructure/pulumi/auth0*"
  - ".github/workflows/*e2e*"
---

# Gotchas — Auth0 / E2E

Path-scoped sibling of [gotchas.md](./gotchas.md#auth0--e2e).

- **The Auth0 ROPC grant requires a SPA or Regular Web Application** — M2M apps return `401 access_denied` even with Password grant enabled. `E2E_AUTH0_CLIENT_ID` points at `mattbutlerengineering-hospitality` (SPA).
- **An empty `E2E_AUTH0_CLIENT_ID` shows up as "Missing required E2E auth env vars"** — usually `gh secret set` run without `--body`.
