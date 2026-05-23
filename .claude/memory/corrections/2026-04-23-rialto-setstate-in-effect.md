---
date: 2026-04-23
session: rialto-review
trigger: AI-generated Rialto components used setState inside useEffect body causing render loops
correction: Use render-time derivation (snapshot pattern) or event handlers instead
root_cause: LLMs default to the common React pattern of syncing derived state via useEffect plus setState.
prevention: Pre-commit hook flags setState inside useEffect body in Rialto components (banned).
feeds_back_into: packages/rialto/CLAUDE.md, .claude/rules/gotchas.md#pre-commit--lint
---

## Summary

Rialto components must not call `setState` inside a `useEffect` body. This pattern causes render loops because setting state triggers a re-render, which re-runs the effect, which sets state again. The correct alternatives are render-time derivation (compute the value during render without storing it in state) or event handlers (set state only in response to user actions). A pre-commit hook enforces this ban in the Rialto package. This is a hard constraint because LLMs frequently generate the forbidden pattern by default — it is common in general React tutorials but causes correctness bugs in Rialto's rendering model.
