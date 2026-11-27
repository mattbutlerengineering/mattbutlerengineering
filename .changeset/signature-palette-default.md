---
"@mattbutlerengineering/rialto": patch
---

The signature palette is now the default: secondary and ghost Buttons, Input, Select and Tabs take plum, plum-muted and tinted without a scope attribute. Tier-3 component tokens re-resolve on `[data-theme]`, so a nested light island inside dark takes its own light values. Velvet bands re-declare a lighter error red so an invalid Input is legible there. Dark tinted (brown) is no longer a signature surface: the dark `surface-tinted` token now equals the dark recessed surface.
