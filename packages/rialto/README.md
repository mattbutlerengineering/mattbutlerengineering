# Rialto

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](../../LICENSE)

<!-- acmm:begin -->![ACMM Level 6](https://img.shields.io/badge/ACMM-Level%206-d4a030?style=flat-square)<!-- acmm:end -->

React component library and design system. Inspired by precision industrial design with warm material surfaces, surgical color, and tactile interactions.

## Usage

```typescript
import { Button, Input, Card, Text, Stack } from "@mattbutlerengineering/rialto";
import "@mattbutlerengineering/rialto/styles"; // Import before any component rendering

// Wrap your app root
<RialtoProvider theme="light">
  <App />
</RialtoProvider>
```

## Compatibility

Every component works from a registry install (`npm.pkg.github.com`,
scoped `@mattbutlerengineering`) **except `ChatPanel`**. `ChatPanel` (and
its `useChatStream` hook) imports `@mbe/api-client/streaming`, a private,
workspace-only package that is never published anywhere — it exists only
inside this monorepo. Rialto's build externalizes that import rather than
bundling it (so the design-system bundle doesn't inline an app-specific
data client), which means a registry consumer would need to supply
`@mbe/api-client` themselves — something no consumer outside this
monorepo can do, since the package isn't resolvable from any registry.
`ChatPanel` is therefore usable only by workspace-internal consumers of
this monorepo (`apps/hospitality`, `apps/rialto-web`, `apps/gen`), which
already declare `@mbe/api-client` as their own direct dependency. See
`.claude/rules/gotchas.md` § Releases for the changesets-versioning side
of this (#3322).

## Design Principles

- **Material honesty** -- surfaces communicate what they are
- **Surgical color** -- warm neutral palette with gold/amber as the single accent
- **Tactile interaction** -- buttons feel like physical controls
- **Precision restraint** -- minimal font weights, tight spacing, small radii

## Key Rules

- Never hardcode colors -- use `var(--rialto-*)` tokens
- Gold accent only for focus rings, active states, and primary actions
- Maximum 3 font weights: 300, 400, 500

## Commands

```bash
pnpm build        # Build library
pnpm test         # Run tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```

From the monorepo root:

```bash
pnpm size         # Check bundle size
pnpm size:check   # Enforce size limits
```

See [CLAUDE.md](CLAUDE.md) for the full token reference, component APIs, and design philosophy.
