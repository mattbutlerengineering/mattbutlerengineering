# Agent Identity & Attestation

## Purpose

Establish non-repudiation for AI agent actions — prove which agent made which change, when, and under what authorization.

## Current State

| Mechanism       | Status  | Notes                                                                           |
| --------------- | ------- | ------------------------------------------------------------------------------- |
| Git author      | Partial | Agents use the repo owner's git config — not distinguishable from human commits |
| Co-Authored-By  | Active  | Agent PRs include `Co-Authored-By: Claude` trailer                              |
| Branch naming   | Active  | Agent branches use `agent-*` or `worktree-agent-*` prefix                       |
| GitHub labels   | Active  | Agent PRs labeled `has-pr`, issues labeled `in-progress` during work            |
| Langfuse traces | Active  | Each session has a trace with model, cost, and task metadata                    |

## Attestation Strategy

### Phase 1: Metadata-Based (Current)

- Branch name prefix identifies agent-authored code
- `Co-Authored-By` trailer in commit messages
- GitHub labels for state machine tracking
- Langfuse session traces for audit trail

### Phase 2: Bot Account (Recommended Next Step)

- Create a dedicated GitHub bot account (e.g., `mbe-agent-bot`)
- Configure `@mbe/agent-core` to commit as the bot user
- Bot commits show distinct avatar and author in GitHub UI
- Enables per-agent permission scoping

### Phase 3: GPG-Signed Commits (Future)

- Generate a GPG key for the bot account
- Sign all agent commits — shows "Verified" badge on GitHub
- Cryptographic proof of which key (agent) made which change
- Required for regulated environments (SOC2, FDA)

## Implementation Notes

### Configuring agent-core for bot commits

In `packages/agent-core/src/session.ts`, the git author can be overridden:

```bash
git config user.name "mbe-agent[bot]"
git config user.email "mbe-agent[bot]@users.noreply.github.com"
```

This should be set in the worktree before the agent starts working, not globally.

### GPG signing

```bash
# Generate key for bot
gpg --batch --gen-key <<EOF
Key-Type: eddsa
Key-Curve: ed25519
Name-Real: mbe-agent[bot]
Name-Email: mbe-agent[bot]@users.noreply.github.com
Expire-Date: 1y
%no-protection
EOF

# Configure git to sign
git config user.signingkey <KEY_ID>
git config commit.gpgsign true
```

### Audit trail

All agent actions are already traced to Langfuse with:

- Session ID (links to git branch)
- Model used (sonnet, opus, haiku)
- Cost and token usage
- Task description
- Success/failure status

## Non-Repudiation Guarantees

| Level  | Guarantee                                        | How                      |
| ------ | ------------------------------------------------ | ------------------------ |
| Weak   | "This looks like an agent commit"                | Branch naming convention |
| Medium | "This was committed by the agent account"        | Dedicated bot user       |
| Strong | "This was cryptographically signed by the agent" | GPG-signed commits       |

## References

- GitHub bot accounts: https://docs.github.com/en/apps/creating-github-apps
- Git commit signing: https://docs.github.com/en/authentication/managing-commit-signature-verification
- Langfuse tracing: see CLAUDE.md "AI Observability" section
