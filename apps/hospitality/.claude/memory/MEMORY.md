# Memory

Hospitality app-specific memory for corrections and feedback.

## Active

- All UI uses Rialto components — no raw HTML elements
- All colors use `var(--rialto-*)` tokens
- All API calls use `@mbe/api-client` with `getAccessToken`
- SSE callbacks use refs (not inline)
- State must be immutable
- ES module imports require explicit `.js` extension

## Feedback

- (placeholder for hospitality-specific corrections)

## References

- `./CLAUDE.md` — full developer context
- `./docs/ARCHITECTURE.md` — data flow and API surface
- `./AGENTS.md` — cross-tool agent rules
