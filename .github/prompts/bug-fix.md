# Bug Investigation

Investigate and fix the reported bug using systematic debugging.

## Steps
1. Reproduce the issue — identify the exact input and expected vs actual output
2. Trace the code path from entry point to failure
3. Write a failing test that captures the bug
4. Fix the root cause (not symptoms)
5. Verify the test passes
6. Check for similar patterns elsewhere in the codebase

## Project context
- Backend services use Fastify + Prisma in `services/`
- Frontend apps use React + Vite in `apps/`
- Shared packages in `packages/`
- Run tests with `pnpm --dir <package-path> test`
