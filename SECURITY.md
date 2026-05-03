# Security Policy

## Supported versions

Only the `main` branch receives security updates. There are no maintained release branches; downstream consumers should pin to a commit SHA or to a published `@mattbutlerengineering/*` package version on npm.

| Surface                                                           | Supported                                |
| ----------------------------------------------------------------- | ---------------------------------------- |
| `main` branch                                                     | ✅                                       |
| `@mattbutlerengineering/rialto` (latest published version on npm) | ✅                                       |
| Other published `@mattbutlerengineering/*` packages               | ✅ for the latest published version only |
| Older commits / older published versions                          | ❌ — please update before reporting      |

## Reporting a vulnerability

**Please do not file public GitHub issues for security vulnerabilities.**

Use one of these channels:

1. **GitHub Security Advisory** (preferred) — https://github.com/mattbutlerengineering/mattbutlerengineering/security/advisories/new
   This is private to the maintainers and gives us a workspace to coordinate the fix and CVE assignment.

2. **Email** — `security@mattbutlerengineering.com` (forwards to the maintainer's personal inbox; replies are signed). PGP available on request.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, including affected versions / commits.
- Any proof-of-concept code (please do not include it in a public gist).
- Whether you intend to disclose publicly, and on what timeline.

## What to expect

- **Acknowledgement** within 72 hours of report (usually much sooner).
- **Initial triage** within 7 days. We'll tell you whether we accept the report, what severity we assign, and a rough fix timeline.
- **Critical fixes** ship within 14 days of triage acceptance, faster for actively-exploited issues.
- **Public disclosure** is coordinated with the reporter; we follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure) and prefer 90-day embargo windows.
- We're happy to credit reporters in the advisory unless you ask us not to.

## In scope

- Code in this repository (`apps/`, `packages/`, `services/`, `infrastructure/`, `scripts/`, root config).
- Published `@mattbutlerengineering/*` npm packages.
- The deployed sites at `mattbutlerengineering.com` (subdomains, edge workers, API services).

## Out of scope

- Vulnerabilities in upstream dependencies (please report those to the upstream project; we'll roll forward when they patch).
- Theoretical issues with no practical exploit path.
- Issues requiring an attacker who already has root or full database access (the AuthN/AuthZ layer is the boundary).
- Reports about missing security best-practice settings on the deployed site that don't reach a CVSS-scoring vulnerability (low-severity hardening suggestions are welcome but get the same triage as a regular issue, not the security-advisory channel).
- Social engineering, physical access, or attacks on third-party services we don't operate.

## AI-agent guardrails

This repository runs AI coding agents (`mbe agent run`, claude.ai RemoteTriggers, GitHub Action workflows in `.github/workflows/{ai-fix,claude,auto-qa,nightly-compliance,ai-attribution}.yml`). The hard prohibitions those agents must obey are documented in [`docs/SECURITY-AI.md`](./docs/SECURITY-AI.md) — secrets, destructive ops, network allowlist, approval gates. If you find a way to make an agent in this repo violate one of those guardrails, please report it via the channels above; we treat agent-jailbreak findings with the same severity as a code-execution vulnerability.

The machine-readable mirror of those rules lives at `.github/policies/*.yaml` and is read by reviewer agents at session start.

## Acknowledgements

Reporters and credits go in [`docs/security-acknowledgements.md`](./docs/security-acknowledgements.md) (created on the first acknowledged report).
