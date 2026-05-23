---
date: 2026-04-23
session: rialto-review
trigger: AI-generated Rialto components used setState inside useEffect body causing render loops
correction: Use render-time derivation (snapshot pattern) or event handlers instead
root_cause: LLMs default to the common React pattern of syncing derived state via useEffect plus setState.
prevention: Pre-commit hook flags setState inside useEffect body in Rialto components (banned).
---
