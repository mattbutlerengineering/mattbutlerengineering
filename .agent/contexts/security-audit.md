# Security Audit Context

## Security Checklist

For every security audit, check these areas:

### 1. Authentication & Authorization

- [ ] All sensitive endpoints require `requireAuth`
- [ ] Ownership checks (IDOR protection)
- [ ] Role-based access control (admin vs user)

### 2. Input Validation

- [ ] All inputs validated with Zod schemas
- [ ] No `any` types in request handlers
- [ ] SQL injection prevention (use Prisma parameterized queries)

### 3. Secrets Management

- [ ] No hardcoded secrets in code
- [ ] Env vars for sensitive config
- [ ] `.env*` in `.gitignore`

### 4. Webhooks

- [ ] Signature verification (`verifySignature`)
- [ ] Authorization checks (collaborator permissions)
- [ ] Rate limiting on public endpoints

### 5. CORS

- [ ] Explicit origin allowlist
- [ ] No `Access-Control-Allow-Origin: *` on sensitive endpoints

### 6. Dependencies

- [ ] No known CVEs in dependencies
- [ ] Use `pnpm audit` to check

## Useful Commands

```bash
# Check for vulnerabilities
pnpm audit

# Check dependencies
pnpm outdated
```

## Files to Check

- `services/*/src/routes/*.ts` - endpoints
- `packages/auth/` - auth plugin
- `AGENTS.md` → "Security" for patterns

## Common Patterns

```typescript
// Auth check
preHandler: requireAuth

// Ownership check
if (request.user.sub !== resource.ownerId) {
  return reply.code(403).send(...)
}
```

## Resources

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Security skill: `.claude/skills/security-best-practices/SKILL.md`
