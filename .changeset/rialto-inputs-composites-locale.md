---
"@mattbutlerengineering/rialto": patch
---

Tag, Combobox, Autocomplete, Select, Input, TextArea, PinInput, Avatar, Chalkboard, DataTable, Table, ErrorBoundary, CommandPalette, ChatPanel, Footer, MasterOverride, Spinner and the TapeChart list views now read their built-in text from `useRialtoLocale()`. With no `RialtoLocaleProvider` the English output is unchanged. Rialto lint now enforces `no-literal-ui-strings` across all of `src/`.
