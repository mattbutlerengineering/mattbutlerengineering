---
"@mattbutlerengineering/rialto": patch
---

Pagination, Calendar, DateRange, DatePicker, DateRangePicker, TimePicker, NumberInput, Breadcrumb, Steps, Timeline, Sidebar, NavigationMenu, GlobalNav, Navbar, Skeleton, ScrollArea, ImageUpload and Odometer now read their built-in text from `useRialtoLocale()`, and the context locale is the `Intl` fallback for the date, time and number components when no `locale` prop is given (an explicit `locale` still wins). With no `RialtoLocaleProvider` the output is unchanged. Pagination also announces page changes through a polite, visually hidden live region ("Page 3 of 20").

Additive and backwards compatible: DropdownMenu item `label` and Select option `label` now accept any `ReactNode` (strings still work), so consumers can wrap endonyms in `<span lang>`. Select options gain an optional `textValue` used for type-ahead; it is derived from `label` when that is a string, and a node `label` with no `textValue` is skipped by type-ahead.
