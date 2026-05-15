# Hospitality App Skills

App-specific skills for the hospitality application.

## Available Skills

### hospitality-smoke-test

Pre-deploy smoke test that runs `pnpm test:e2e` for the auth flow.

## Root Skills

For full automation, use the root-level skills:

- `/ship-loop` — full local cycle (audit → fix → push → CI → deploy)
- `/site-audit [smoke|sweep|scout]` — crawl live site
- `/issue-worker` — pick up oldest `ready` issue and PR a fix
- `/ci-monitor` — auto-fix simple CI failures
- `/progress-tracker` — metrics + circuit breaker
- `/acmm-audit` — score repo against AI Codebase Maturity Model
