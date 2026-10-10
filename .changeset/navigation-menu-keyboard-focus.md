---
"@mattbutlerengineering/rialto": patch
---

NavigationMenu: keep the dropdown open when keyboard focus moves from the trigger into the panel (previously the trigger blur armed a close timer that nothing cancelled, stranding focus on `<body>`).
