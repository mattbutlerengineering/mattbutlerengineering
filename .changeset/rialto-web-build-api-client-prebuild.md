---
"@mattbutlerengineering/rialto": patch
---

**Build output: `rollupOptions.external` now reads from a shared `libExternal` module** (`packages/rialto/scripts/lib-external.ts`), reused by a new build-source regression test. No runtime behavior changes for consumers — `@mbe/api-client` and its subpaths were already externalized (#3317); this refactor just adds a gate so a future component can't reintroduce an un-externalized workspace import without a test failing first. See #4843.
