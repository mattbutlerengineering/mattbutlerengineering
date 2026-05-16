---
name: opencode
description: "Configure and use OpenCode AI coding assistant. Use when user mentions opencode, wants to set up OpenCode, or asks about OpenCode config (opencode.json). Trigger: /opencode, opencode config, set up opencode, opencode.json"
user-invocable: true
---

# OpenCode Configuration

OpenCode is an AI coding assistant that uses `opencode.json` for project-specific configuration.

## Project Config

The project config is at `opencode.json` in the repo root. It defines:
- Model selection (`model`, `small_model`)
- Permissions (`permission` object)
- MCP servers (`mcpServers`)
- Agent configurations (`agents`)

## Quick Setup

**Verify OpenCode is installed:**
```bash
which opencode
```

**Create project config** (already exists at `opencode.json`):
```bash
cat opencode.json
```

**Test OpenCode with the project:**
```bash
opencode "List the files in the apps directory"
```

## Config Structure

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-6",
  "contextPaths": ["AGENTS.md", "CLAUDE.md", "GEMINI.md"],
  "permission": {
    "read": { "*": "allow" },
    "edit": { "*": "ask" },
    "bash": { "*": "ask", "git *": "allow" }
  }
}
```

## Key Settings

| Setting | Purpose | Default |
|---------|---------|---------|
| `model` | Primary model (format: `provider/model`) | `anthropic/claude-sonnet-4-6` |
| `small_model` | Lightweight model for simple tasks | `anthropic/claude-haiku-4-5` |
| `contextPaths` | Files loaded as context | `[]` |
| `permission` | Tool access rules | See OpenCode docs |

## MCP Servers

Add MCP servers in `opencode.json`:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "type": "stdio"
    }
  }
}
```

## References

- Config docs: https://opencode.ai/docs/config
- Schema: https://opencode.ai/config.json
- Permissions: https://opencode.ai/docs/permissions
