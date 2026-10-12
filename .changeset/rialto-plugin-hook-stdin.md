---
"@mbe/rialto-plugin": patch
---

Fix the validate-rialto PostToolUse hook: it read a nonexistent `$CLAUDE_TOOL_ARG_FILE_PATH` env var and so never checked a file. It now reads the file path from the hook JSON payload on stdin (failing open on bad input). Removed the subpath-import rule, which could not match `@mattbutlerengineering/rialto` and contradicted the published subpath exports.
