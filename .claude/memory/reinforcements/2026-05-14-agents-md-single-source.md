---
date: 2026-05-14
session: acmm-audit
action: Used AGENTS.md as the single cross-tool source of truth with all tool configs deriving from it
context: Five distinct AI tool configs (CLAUDE.md, GEMINI.md, .cursorrules, copilot-instructions.md, opencode.json) stay consistent because they reference or auto-sync from AGENTS.md
pattern: Define conventions once in AGENTS.md, then create tool-specific overlays that import or extend it
---
