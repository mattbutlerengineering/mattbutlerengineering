# Rialto

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
