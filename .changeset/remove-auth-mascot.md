---
"@mattbutlerengineering/rialto": major
---

**AuthMascot — removed.** The `AuthMascot` component and its `MascotState` type have been removed from the design system. It was a decorative element carrying a per-component accessibility/reduced-motion maintenance cost that no longer fits the design direction. The `@mattbutlerengineering/rialto/AuthMascot` subpath export, the `MascotState` type export, and the catalog registry entry are gone. Consumers rendering `<AuthMascot />` must remove the import and render call; there is no drop-in replacement.
