# Visual Test Skill for Rialto Web

Run visual regression tests for rialto-web components.

## When
- After any UI changes in rialto-web
- Before marking UI work complete

## How
```bash
pnpm test:visual   # from monorepo root
```

## Check
- Review `apps/rialto-web/e2e/visual/` for baseline screenshots
- Any new failures need baseline update or fix