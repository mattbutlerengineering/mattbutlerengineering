# Audit Bot Fight Mode Bypass

Automated site audits (Lighthouse, Playwright, curl from RemoteTriggers) are
blocked by Cloudflare Bot Fight Mode with HTTP 403. This document describes the
two-layer fix.

## Layer 1: Edge Router (code -- already deployed)

The edge router Worker validates the `X-Audit-Token` request header against the
`AUDIT_TOKEN` secret. Verified requests bypass rate limiting so automated audits
can run at full speed without hitting 429 errors.

**Setup:**

```bash
# Generate a random token
AUDIT_TOKEN=$(openssl rand -hex 32)

# Set it as a Worker secret
cd infrastructure/worker
wrangler secret put AUDIT_TOKEN
# Paste the token value when prompted

# Export in the audit environment (RemoteTrigger, CI, local)
export AUDIT_TOKEN="<same value>"
```

## Layer 2: Cloudflare WAF Custom Rule (manual -- dashboard required)

Bot Fight Mode runs _before_ the Worker and cannot be controlled from code.
A WAF custom rule is needed to skip Bot Fight Mode for requests carrying the
audit token.

**Steps:**

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) for the
   `mattbutlerengineering.com` zone
2. Navigate to **Security > WAF > Custom Rules**
3. Create a new rule:
   - **Rule name:** `Audit Bot Bypass`
   - **Expression:**
     ```
     (http.request.headers["x-audit-token"][0] eq "<AUDIT_TOKEN value>")
     ```
   - **Action:** `Skip`
   - **Skip options:** Check `Bot Fight Mode`
4. Save and deploy the rule

**Important:** The token value in the WAF rule must match the `AUDIT_TOKEN`
Worker secret exactly.

## GitHub Actions Secret

`AUDIT_TOKEN` must also be set as a **GitHub Actions repository secret** so that
`audit-sweep.yml` and `audit-scout.yml` can validate it at job startup and
fail fast with a clear error if it is missing or empty.

```
Repository → Settings → Secrets and variables → Actions → New repository secret
Name:  AUDIT_TOKEN
Value: <same token value as the Worker secret>
```

The `audit-sweep` and `audit-scout` workflows validate the secret at startup
and exit 1 with an actionable error message if it is absent, so a missing token
is caught within minutes of the next scheduled run rather than silently failing
for days.

## Audit Script Usage

The site-audit skill already sends the token when `AUDIT_TOKEN` is set:

```bash
AUDIT_CURL_OPTS=(-sf -A "Mozilla/5.0 ...")
[ -n "${AUDIT_TOKEN:-}" ] && AUDIT_CURL_OPTS+=(-H "X-Audit-Token: $AUDIT_TOKEN")
curl "${AUDIT_CURL_OPTS[@]}" "$URL"
```

## Verification

After both layers are configured, verify the bypass works:

```bash
# Should return 200 (not 403)
curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Audit-Token: $AUDIT_TOKEN" \
  https://mattbutlerengineering.com/

# Health endpoint should also work without rate limiting
curl -s -o /dev/null -w "%{http_code}" \
  -H "X-Audit-Token: $AUDIT_TOKEN" \
  https://mattbutlerengineering.com/health/system
```
