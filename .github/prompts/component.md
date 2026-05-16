# New Rialto Component

Create a new component in the `@mattbutlerengineering/rialto` design system.

## Structure

Components live in `packages/rialto/src/components/<ComponentName>/`.

## Files to create

- `index.tsx` — component implementation
- `<ComponentName>.test.tsx` — unit tests
- `<ComponentName>.stories.tsx` — Storybook stories
- `<ComponentName>.module.css` — CSS modules (if needed)

## Requirements

- WCAG AA accessible (proper ARIA, keyboard nav, color contrast)
- Export props interface as `<ComponentName>Props`
- No `setState` inside `useEffect` body — use render-time derivation
- Add to barrel export in `packages/rialto/src/index.ts`
- Run `pnpm --dir packages/rialto build` after adding
