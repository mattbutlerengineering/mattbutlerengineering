# Dependency Bump Context

## How Dependencies Work

This monorepo uses **pnpm with catalog** for dependency management.

### Key Patterns

1. **Workspace protocol** (`workspace:*`): Always prefer this for internal packages
   ```json
   "@mbe/types": "workspace:*"
   ```

2. **Catalog versions**: Defined in `pnpm-workspace.yaml`
   ```yaml
   catalog:
     typescript: ^5.3.0
     vitest: ^2.0.0
   ```

3. **Adding deps**:
   ```bash
   pnpm add <package> -w                 # workspace root
   pnpm add <package> --filter @mbe/app  # specific package
   ```

4. **Updating deps**:
   ```bash
   pnpm up                    # update all
   pnpm up <package>          # specific
   pnpm up -r                 # recursive
   ```

### Files to Check
- `pnpm-workspace.yaml` - catalog versions
- `package.json` - workspace root deps
- `apps/*/package.json` - app deps
- `services/*/package.json` - service deps

### Anti-patterns
- ❌ Don't use `file:` protocol for internal packages (use `workspace:*`)
- ❌ Don't hardcode versions in package.json (use catalog)
- ❌ Don't forget to rebuild after dep changes

See: `AGENTS.md` → "Model Governance" for tier guidance on dep bumps.
