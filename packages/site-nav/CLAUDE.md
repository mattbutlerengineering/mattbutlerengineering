# @mbe/site-nav

The mattbutlerengineering.com site chrome data shared by every app that renders
the full header and footer: the "Engineering" menu, the footer link columns and
the copyright line. Pure functions and constants, no React and no IO, so it does
not depend on rialto: the shapes match `GlobalNav`'s `menu` and `Footer`'s
`columns` props structurally.

## Structure

```
src/
├── index.ts          # Barrel export
├── site-nav.ts       # ENGINEERING_PAGES, engineeringMenu, siteFooterColumns, siteCopyright
└── site-nav.test.ts
```

## Consumers

- `apps/marketing` (`src/App.tsx`) — header menu and rich footer on every page
- `apps/gen` (`src/components/SiteChrome.tsx`) — the signed-out and auth-failure screens

## Adding a page to the Engineering menu

Add it to `ENGINEERING_PAGES`. Both apps pick it up. Every consumer must also list
`packages/site-nav/**` in its deploy trigger (`deploy-static.yml`, `pulumi-up.yml`),
pinned by `scripts/__tests__/deploy-static-app-paths.test.mjs` and
`pulumi-up-gen-closure.test.mjs`.
