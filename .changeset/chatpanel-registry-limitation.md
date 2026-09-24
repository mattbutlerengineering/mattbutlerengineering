---
"@mattbutlerengineering/rialto": patch
---

**Documented: `ChatPanel` is not usable from a registry install.** `ChatPanel` (and its `useChatStream` hook) imports `@mbe/api-client/streaming`, a private, workspace-only package that is never published anywhere. Rialto's build externalizes that import rather than bundling it, so a registry consumer would need to supply `@mbe/api-client` themselves — not possible outside this monorepo, since the package isn't resolvable from any registry. `ChatPanel` is therefore usable only by workspace-internal consumers of this monorepo. See the README's new Compatibility section.
