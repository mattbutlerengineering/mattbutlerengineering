# New API Endpoint

Add a new endpoint to a Fastify service.

## Structure

Services live in `services/<name>/src/routes/`. Each route file exports a Fastify plugin.

## Steps

1. Create route file in `services/<name>/src/routes/<resource>.ts`
2. Define JSON Schema for request params, body, and response
3. Register the route plugin in `services/<name>/src/app.ts`
4. Add integration tests in `services/<name>/src/routes/__tests__/`
5. Run `pnpm --dir services/<name> test` to verify

## Patterns

- Use `@mbe/api-client` for inter-service calls (ADR-001)
- Use repository pattern for data access
- Validate all input with Fastify schemas
- Return consistent envelope: `{ success, data, error }`
