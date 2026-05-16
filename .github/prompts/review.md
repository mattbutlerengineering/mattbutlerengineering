# PR Review

Review this pull request against the project's coding standards.

## Checklist
- Immutable data patterns (no in-place mutation)
- Error handling at system boundaries
- Functions under 50 lines, files under 800 lines
- No hardcoded secrets or credentials
- Input validation on external data
- Conventional commit messages
- Test coverage for new functionality

## Focus areas
- Check `services/*/src/routes/` for proper Fastify schema validation
- Check `packages/rialto/src/` for accessibility (WCAG AA)
- Check for proper use of `@mbe/api-client` (ADR-001)
- Verify no `setState` inside `useEffect` body in React components
