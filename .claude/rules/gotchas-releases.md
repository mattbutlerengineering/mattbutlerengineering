---
paths:
  - ".changeset/**"
  - "packages/rialto/package.json"
  - "packages/rialto/vite.config.lib.ts"
  - "packages/rialto/CHANGELOG.md"
---

# Gotchas — Releases (changesets / rialto)

Path-scoped sibling of [gotchas.md](./gotchas.md#releases-changesets--rialto).

- **Changesets need `GITHUB_TOKEN`:** `GITHUB_TOKEN=$(gh auth token) pnpm version-packages`.
- **Push before you version** — `@changesets/get-github-info` 404s on local-only commits. Always `git push origin main` → `pnpm version-packages`.
- **The post-version prettier step fails (`Cannot find package '@mbe/config'`) and silently skips the `CHANGELOG.md` write** — prepend the version block by hand.
- **`pnpm release` regenerates rialto's `package.json` exports map when a component folder is added** — `git status` afterwards and commit the diff.
- **A rialto component importing an un-externalized workspace package fails the Release build** (`Rolldown failed to resolve import "@mbe/…"`) — add it to `rollupOptions.external` in `vite.config.lib.ts`.
- **A public package's `dependencies`/`peerDependencies` edge onto a private or ignored workspace package makes `changeset version` throw `Invalid tree`** (#3322, PR #5721). Declare workspace-only needs in `devDependencies`, or inject them (rialto's `ChatPanel` takes a `stream` prop). Don't flip `privatePackages.version: true` — it un-skips every private package. Guarded by `scripts/check-changeset-tree.mjs` in `repo-audit`.
