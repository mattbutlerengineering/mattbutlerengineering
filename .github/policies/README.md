# Policy as code

Machine-readable encoding of the rules in [`docs/SECURITY-AI.md`](../../docs/SECURITY-AI.md) and [`docs/change-tiers.md`](../../docs/change-tiers.md). Each `*.yaml` file in this directory is one policy domain.

> **ACMM L5 self-tuning signal.** Policies expressed as data (rather than as prose buried in a markdown file or as imperative checks scattered across review scripts) can be:
>
> - Loaded by reviewer agents at session start as input to `pr-review-toolkit:code-reviewer`
> - Validated by a CI job (when GH Actions is funded) using `conftest` or an OPA policy engine
> - Diffed across PRs so a change to a rule is visible in the same way as a code change
>
> The doc is the spec; this directory is the implementation. They must agree.

## Files

| File | Domain | Source of truth |
|---|---|---|
| `secrets.yaml` | Never-commit patterns; secret-handling rules | `docs/SECURITY-AI.md § Secrets` |
| `destructive-ops.yaml` | Git, database, infrastructure prohibitions | `docs/SECURITY-AI.md § Destructive ops` |
| `network-allowlist.yaml` | Outbound domain allowlist for agents | `docs/SECURITY-AI.md § Network & exfiltration` |
| `change-tiers.yaml` | Risk-tier classification rules | `docs/change-tiers.md` |

## How agents apply these policies

Reviewer agents (`pr-review-toolkit:code-reviewer`, `adr-compliance-reviewer`, `migration-reviewer`) read these files at session start. The patterns and rules are evaluated against the diff and used to:

1. Reject changes that violate a `forbidden_patterns` entry in `secrets.yaml` or `destructive-ops.yaml`.
2. Auto-classify a PR using `change-tiers.yaml` rules (mirror of the `tier-classifier.yml` workflow logic).
3. Block any agent action that requires reaching a domain not listed in `network-allowlist.yaml`.

## How to update a policy

Edits to a `.yaml` file in this directory require a corresponding edit to the source-of-truth markdown doc, and vice versa. A change that loosens a security policy is a `tier:critical` PR per `change-tiers.yaml`. The PR description must include a "Why this loosens" section.

## Format

Each policy file uses a small, hand-rolled schema described in its `$comment` field. We do not (yet) use a formal schema validator like JSON Schema or OPA; the format is meant to be readable by humans, agents, and a single Node script. If we adopt OPA, the rules transcribe cleanly to Rego.
