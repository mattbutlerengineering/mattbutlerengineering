---
name: codex
description: "Configure and use OpenAI Codex CLI. Use when user mentions codex, wants to set up Codex, or asks about Codex config (.codex/config.toml). Trigger: /codex, codex config, set up codex, .codex/config.toml"
user-invocable: true
---

# Codex CLI Configuration

OpenAI Codex CLI uses `.codex/config.toml` for project-specific configuration.

## Project Config

The project config is at `.codex/config.toml` in the repo root. It defines:

- Model selection (`model`)
- Approval policy (`approval_policy`)
- Sandbox settings (`[sandbox]`)
- MCP servers (`[mcp_servers]`)

## Quick Setup

**Verify Codex CLI is installed:**

```bash
which codex
```

**Create project config** (already exists at `.codex/config.toml`):

```bash
cat .codex/config.toml
```

**Test Codex with the project:**

```bash
codex "List the files in the apps directory"
```

## Config Structure

```toml
#:schema https://developers.openai.com/codex/config-schema.json

# Model configuration
model = "gpt-4.1"

# Approval policy: suggest, auto-edit, full-auto, or manual
approval_policy = "suggest"

# Context file for project understanding
model_instructions_file = "AGENTS.md"

# Sandbox settings
[sandbox]
enable = true
workspace_write = "read-only"
```

## Key Settings

| Setting                   | Purpose                       | Default     |
| ------------------------- | ----------------------------- | ----------- |
| `model`                   | Model to use                  | `gpt-4.1`   |
| `approval_policy`         | How code changes are approved | `suggest`   |
| `model_instructions_file` | File with project context     | `AGENTS.md` |
| `sandbox.enable`          | Enable sandboxing             | `true`      |

## Approval Policies

- `suggest` — Suggest changes, require approval
- `auto-edit` — Auto-apply edits, ask for dangerous commands
- `full-auto` — Fully automatic (use with caution)
- `manual` — Ask for every action

## MCP Servers

Add MCP servers in `.codex/config.toml`:

```toml
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "."]
```

## References

- Config docs: https://developers.openai.com/codex/config-reference
- Schema: https://developers.openai.com/codex/config-schema.json
- Overview: https://developers.openai.com/codex/config-basic
