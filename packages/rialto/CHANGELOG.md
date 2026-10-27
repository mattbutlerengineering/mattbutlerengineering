# @mattbutlerengineering/rialto

## 0.9.1

### Patch Changes

- [#7755](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7755) [`6af871b`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/6af871b9efe667a897fcc7bf64992806557923ca) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Drawer's close button is 44px square on touch (`(pointer: coarse)`) devices, meeting the minimum target size; mouse and trackpad users keep the compact 28px button.

- [#7798](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7798) [`9c24507`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/9c2450793b14b94d58cb6a2ecea5d312b643a43e) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Widen the `framer-motion` peer range to include `^14.0.0`, so consumers on 14.x no longer get a peer warning. Rialto's own tests and typecheck run against 14.6.

- [#7741](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7741) [`7061edd`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/7061edd590c8643de69d5a4e36a8a101a70596b9) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Popover no longer dismisses on a press inside a descendant portaled to `document.body` (such as a `Select` listbox), so mouse picks in a Select inside a Popover now register. `useDismiss` gains an optional `isInside` predicate.

## 0.9.0

### Minor Changes

- [#7598](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7598) [`36f7c91`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/36f7c91380c1fc3440d80dc12c9fcb5245b2bde9) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `Calendar` takes an optional `getDateLabel(iso)` that supplies a day's accessible name (for example why a date is closed). Days it returns nothing for keep their number as the name.

### Patch Changes

- [#7538](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7538) [`0e9fb02`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/0e9fb02122d6525af5ed77bc64334709c31cbf91) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ReservationList and TimeSlots catalog descriptions tell a generating model to copy the venue-local `HH:mm` time as is, since the element now writes it in the locale's clock. ReservationList's rows now share one subgrid, so a dated time such as "Fri Oct 16, 7:30 PM" stays on one line and every row stays aligned.

## 0.8.7

### Patch Changes

- [#7533](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7533) [`464215c`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/464215cad657d1f6774a5386f71d7f694fb77b5f) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ReservationList and TimeSlots show a bare 24-hour `HH:mm` time in the active locale's clock ("8:30 PM" in en-US, "20 h 30" in fr-CA). Already-formatted display text is unchanged.

## 0.8.6

### Patch Changes

- [#7466](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7466) [`eeb5bfa`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/eeb5bfaf9010a7354e4f93d4844498899cae68a4) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add the locale words the upcoming reservation, open-times and guest chat elements render — `partyOf`, `visitCount`, `reservationStatus`, `guestRisk`, `walkIn`, `noOpenTimes` and the list names `reservations`, `openTimes`, `guests` — in every locale, plus an internal status and risk normalizer.

- [#7475](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7475) [`953f3b9`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/953f3b9e7839612b003f5f0fdbe227bce436eaf1) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add GuestCards, a display-only stack of guest cards (name in the display face, localized visit count and risk word in its tone, tags in a wrapping row; never contact details, notes or spend), with a catalog meta for generative UI.

- [#7471](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7471) [`b2ba512`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/b2ba512e281b4783d90995c1a8a6f53e8cc64630) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add ReservationList, a display-only list of bookings (time, guest or Walk-in, party size and status word in its tone), with a catalog meta for generative UI.

- [#7474](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7474) [`8bb548c`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/8bb548ca7bfeb8cc5ef7ad2b8c4b7bd329abf721) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add TimeSlots, a display-only list of open times for one date and party size (a date line over static Tag-look labels that wrap, or a localized "No open times" line), with a catalog meta for generative UI.

- [#7469](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7469) [`4150f46`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/4150f46c4085354805add0c707c7f3e1318d5cf5) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Timeline: timestamps now share one column as wide as the longest of them (capped at a third of the Timeline, wrapping past that), so a long timestamp such as "March 14, 2025" no longer runs under its event dot. Short timestamps keep today's 64px (48px compact) column. The catalog description now names only a guest's visit history.

## 0.8.5

### Patch Changes

- [#7456](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7456) [`85b7783`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/85b77836f02a2f357d14af95cd8f5e3eff413521) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add catalog metadata for Stat, Timeline, Tag and StatusLED so generative UI can offer them.

- [#7460](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7460) [`ce18386`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/ce18386e8c02235455f8bb252b48a264f161afd3) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Text and Badge catalog metadata declare a string `text`/`label` prop so generated UI can give them words.

- [#7462](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7462) [`1b7ad23`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/1b7ad23fbcd9a485b0d9a3c230a9eb79b1e338d4) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Text and Badge catalog metadata require their words; Timeline events tolerate a missing title.

## 0.8.4

### Patch Changes

- [#7448](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7448) [`e8947c2`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e8947c2b7dfc1201cb7d4f33bd2c11028e98d239) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel: cancelling a proposed action now marks the proposing reply ("Cancelled. Nothing was changed.") and sends that outcome with the next request, so the model stops re-asking. Adds the `actionCancelled` locale key and an optional `note` on `ChatMessage`.

- [#7447](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7447) [`a3d6e46`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/a3d6e468932c881bf83d9b0a0b40f5a52d2d81ae) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel: the confirm bar no longer title-cases its label with CSS, which mangled host-supplied and translated titles ("Seat A Walk-In"). The raw fallback title is now sentence case.

- [#7445](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7445) [`a8e0a56`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/a8e0a5688e14cf02b59a6590d1cc20a9a2b3c0a5) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel: add an optional `describeAction` prop so the host app can present a pending write in the confirm bar (a title and labelled values) instead of the raw tool name and input. Exports the `ActionDescription` type.

- [#7441](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7441) [`0519590`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/05195903bec635014e669e295e49da348d097b0b) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel: offer starter `suggestions` on an empty conversation, keep the newest message scrolled into view, show the typing indicator on every turn, swap Send for a Stop button while a reply streams, and preserve line breaks in replies. Adds the `stop` and `chatSuggestions` locale keys.

- [#7439](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7439) [`e50ac66`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e50ac6617c1cb444ace0dbffe0b3fc519e6a1ece) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel: add an optional `requestContext` prop whose fields are merged into every chat request body, so a host app can send context such as the selected venue and its time zone.

## 0.8.3

### Patch Changes

- [#7417](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7417) [`eee4a17`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/eee4a17189a99a3cf2557b286770a53ad6ff6c50) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel now invokes registry components with json-render's ComponentRenderProps contract ({ element, children, emit, on }) instead of spreading raw props, and nests streamed elements by their children ids (with a cycle guard). Previously every catalog registry component crashed or rendered empty in the chat drawer.

- [#7416](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7416) [`7f76d0e`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/7f76d0ed34562187d87b0c7238af10468b3455af) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel's confirm now sends the confirmed action's toolName and toolInput, matching the gen-agent server's new confirmation gate, which executes exactly the input the user approved (at most once) instead of running write tools before confirmation.

## 0.8.2

### Patch Changes

- [#7411](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7411) [`996a9ab`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/996a9ab681b474138020f58754f222652a22d51d) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Tag: selected state uses `--rialto-text-on-accent` text so it meets WCAG AA 4.5:1 contrast in light and dark themes.

- [#7407](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7407) [`c67f643`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/c67f64308d20e8f029901ebe0be210a0fc64a64f) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - TapeChart: a bar's accessible name now always contains its visible text (title and price), fixing the axe `label-content-name-mismatch` finding (WCAG 2.5.3).

## 0.8.1

### Patch Changes

- [#7335](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7335) [`3585ad6`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/3585ad6a9bdc68a7925fd303d0d09d8fefb49afe) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - MasterOverride: the safety cover button's accessible name now starts with its visible text, fixing the axe `label-content-name-mismatch` violation.

## 0.8.0

### Minor Changes

- [#7115](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7115) [`02dc742`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/02dc7421767b6eec3c4d83b67bcec86fb44b2599) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `ChatPanel` now takes a required `stream` prop (`ChatStreamFn`) instead of importing `@mbe/api-client/streaming`, so it resolves for registry consumers. Rialto exports `ChatStreamFn` and `ChatStreamRequest`; pass `streamNDJSON` (or any `(request) => AsyncIterable<unknown>`) as `stream`.

### Patch Changes

- [#7108](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/7108) [`afdcc9f`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/afdcc9fff8166f5c5d31e31b5d4b3de660647ce5) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Localize built-in strings that were English literals inside conditionals: the ThemeToggle accessible name, Form's error-summary count, TapeChart's reservation counts and default labels, DataTable's per-row checkbox name, PinInput's completion announcement, ChatPanel's no-reason tool denial, TextArea's character counter and Combobox's result count. Each now resolves from `RialtoMessages` (new keys include `switchToLightMode`, `switchToDarkMode`, `fieldsNeedAttention`, `reservationCount`, `selectThisRow`, `codeComplete`, `notAllowed`, `characterCount`, `resultsAvailable` and the nested `tapeChart` group), with es-MX and fr-CA values; en-US text is unchanged and TapeChart's `strings` prop still overrides its defaults. The per-locale bundle budget rises from 1.5 kB to 2.2 kB brotli, because TapeChart's default strings moved into the locale dictionaries (about 0.5 kB per translated locale); each locale is a lazily imported subpath, so only consumers that import it pay for it.

## 0.7.1

### Patch Changes

- [#6883](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6883) [`bc9d76d`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/bc9d76d1a7f22c51a068b22bc2faf2e9b25cc5ac) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - A11y audit iteration 6: fix axe `color-contrast` failures. Pagination's active page now uses `--rialto-text-on-accent` instead of white on the gold fill, the accent Divider label is a darkened accent mix that clears 4.5:1, and DataList labels on striped rows use `--rialto-text-secondary`.

## 0.7.0

### Minor Changes

- [#6865](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6865) [`3240235`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/3240235b7573e7e84bc5c6403ec817db570b6753) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - DropdownMenu: add `side` prop (`"bottom"` default, `"top"`) so menus whose trigger is pinned to the bottom of a container can open upward instead of being clipped or covered.

### Patch Changes

- [#6868](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6868) [`dba88e3`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/dba88e32e946855173c33d688eeadd41c2419388) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - DropdownMenu: the open menu is now opaque in the light theme too (it used the translucent glass surface, so content behind it showed through).

## 0.6.6

### Patch Changes

- [#6823](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6823) [`34f155b`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/34f155bde5eddf5e5236bbe3ae5567595800b525) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Input: stop hiding the `endIcon` slot with `aria-hidden`, so interactive end content (for example a password show/hide button) stays reachable by assistive technology. Decorative icons remain hidden through the icon component itself.

## 0.6.5

### Patch Changes

- [#6741](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6741) [`42f8107`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/42f81075f4040b25179c7db270136bb41928c746) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - GlobalNav accepts an optional `labels` prop so a consumer can localize the app link labels; omitted apps keep the English defaults.

## 0.6.4

### Patch Changes

- [#6724](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6724) [`7d05cdc`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/7d05cdca51e47bf63ae20d0b251eba1998f228a9) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Tag, Combobox, Autocomplete, Select, Input, TextArea, PinInput, Avatar, Chalkboard, DataTable, Table, ErrorBoundary, CommandPalette, ChatPanel, Footer, MasterOverride, Spinner and the TapeChart list views now read their built-in text from `useRialtoLocale()`. With no `RialtoLocaleProvider` the English output is unchanged. Rialto lint now enforces `no-literal-ui-strings` across all of `src/`.

## 0.6.3

### Patch Changes

- [#6722](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6722) [`b32c622`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/b32c622d6a4ce67f64a34223a77a86f928370f51) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - NeonSign: the unlit (closed) tube now uses `--rialto-text-secondary` instead of `--rialto-border`, so its text meets WCAG AA 4.5:1 on the recessed housing in both themes. PageHeader: add an optional `breadcrumbLabel` prop to name the breadcrumb `<nav>` so a page with several headers keeps unique landmarks. Defaults to the localized "Breadcrumb" — existing consumers see no change.

## 0.6.2

### Patch Changes

- [#6707](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6707) [`e4e8624`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e4e862425c2d79770574d0ece880bcb5f718024a) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add an optional `ariaLabel` prop to `Pagination` so a page rendering more than one instance can give each `<nav>` landmark a distinct accessible name, satisfying axe's `landmark-unique` rule. Defaults to `"Pagination"` — existing consumers see no change.

- [#6693](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6693) [`a262b52`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/a262b52f3ca0ca1e6c38d17df2df7db332e8e6fb) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Navigation a11y (audit iteration 5): Breadcrumb hides its collapsed "…" placeholder from the list, collapses correctly at `maxItems={1}`, and now forwards rest props to the `nav` (a consumer `aria-label`/`aria-labelledby` overrides the default "Breadcrumb"). Pagination renders its controls as a list and moves focus to the current page when Next/Previous becomes disabled.

- [#6591](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6591) [`5c53ebf`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/5c53ebf86614e1beb6c3199d38ed55da113cec10) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add `RialtoLocaleProvider` and `useRialtoLocale()` (from `@mattbutlerengineering/rialto/providers`), plus optional `locale` and `messages` props on `RialtoProvider`, for localizing Rialto's built-in text (ADR-028). The hook never throws: with no provider it returns en-US messages and an `undefined` locale, so existing consumers see no change.

- [#6591](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6591) [`5c53ebf`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/5c53ebf86614e1beb6c3199d38ed55da113cec10) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Ship Rialto's built-in text for en-GB, es-MX and fr-CA as subpaths — `@mattbutlerengineering/rialto/locales/en-GB`, `/locales/es-MX`, `/locales/fr-CA` — each typed `RialtoMessages`, for `RialtoProvider`'s `messages` prop (ADR-028). Also fixes missing type declarations for `useRialtoLocale` / `RialtoLocaleProvider` from `./providers`.

- [#6710](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6710) [`aa8eeb2`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/aa8eeb22538b0833f09cad63def7272c94303c92) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Pagination, Calendar, DateRange, DatePicker, DateRangePicker, TimePicker, NumberInput, Breadcrumb, Steps, Timeline, Sidebar, NavigationMenu, GlobalNav, Navbar, Skeleton, ScrollArea, ImageUpload and Odometer now read their built-in text from `useRialtoLocale()`, and the context locale is the `Intl` fallback for the date, time and number components when no `locale` prop is given (an explicit `locale` still wins). With no `RialtoLocaleProvider` the output is unchanged. Pagination also announces page changes through a polite, visually hidden live region ("Page 3 of 20").

  Additive and backwards compatible: DropdownMenu item `label` and Select option `label` now accept any `ReactNode` (strings still work), so consumers can wrap endonyms in `<span lang>`. Select options gain an optional `textValue` used for type-ahead; it is derived from `label` when that is a string, and a node `label` with no `textValue` is skipped by type-ahead.

- [#6689](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6689) [`2bec613`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/2bec613c0e6eb9e85aa2143bdd984f8a139b3667) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Alert, Banner, Toast, Dialog, Drawer, Popover, HoverCard and ConfirmDialog now read their built-in text (dismiss/close labels, fallback accessible names, ConfirmDialog default button labels) from `useRialtoLocale()`. With no `RialtoLocaleProvider` the English output is unchanged.

## 0.6.1

### Patch Changes

- [#6658](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6658) [`b2f41f7`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/b2f41f742115a9230e4e6f5067a43a71d8c088a2) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Navbar: name the root nav landmark (new optional `label` prop, default "Main navigation"; consumer `aria-label`/`aria-labelledby` still wins) and link each submenu toggle to its submenu via `aria-controls` while expanded.

- [#6656](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6656) [`2dac532`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/2dac5322511edd85f9690a5762238e2074bf9f54) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Sidebar: render each section as `role="group"` labelled by its section label via `aria-labelledby` (omitted when unlabeled or collapsed).

## 0.6.0

### Minor Changes

- [#6460](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6460) [`4f53875`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/4f53875d6a24874f289430fa5282bcaadc697700) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Combobox now closes its listbox on Tab. `useCombobox` gains an additive `inputMode: "input"` (plus `wrap`) so text-input comboboxes share one keyboard handler: opens with nothing focused, leaves Space and printable keys to the input, skips disabled items, and closes on Tab/Escape. Combobox and Autocomplete use it; ArrowDown/ArrowUp on a closed Combobox now open with the first/last enabled option highlighted (previously nothing was highlighted), and on a closed Autocomplete they open on the first/last item. Home/End stay with the input caret in input mode (Combobox still uses them to jump within the list). The default button mode is unchanged.

- [#6471](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6471) [`7d8c84f`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/7d8c84fea5fe57dc14f7e90c6f89681857adbb9a) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `RialtoProvider` can now own theme persistence. Pass `persistTheme` and it reads the stored preference (one `THEME_STORAGE_KEY`, shared across tabs), follows the OS color scheme live while the preference is `"system"`, and exposes `{ preference, theme, setTheme, toggleTheme }` to descendants through the new `useTheme()` hook. Apps no longer need to call `useThemeState()` themselves and pass the result in. `useThemeState` stays exported.

- [#6450](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6450) [`179cce4`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/179cce43c1d6fbcf8235391e5bb81ebbc8c646ce) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `useThemeState` now tracks the OS color scheme live: a stored `"system"` preference follows an OS dark-mode switch without a reload (previously it resolved once and never updated). The preference is held in a `useSyncExternalStore`-backed store, so every hook instance (and other browser tabs) share one value. Adds `THEME_STORAGE_KEY` so apps stop copying the `"mbe-theme-preference"` literal. `resolveTheme` is unchanged but remains a non-reactive snapshot; pass the raw preference to `RialtoProvider`'s `theme` prop instead.

### Patch Changes

- [#6358](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6358) [`31559e9`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/31559e9a47c8a0d210dbbd0cd4ab86d5e448824a) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - A11y audit iteration 3: Popover and DropdownMenu triggers now fire the consumer's `onClick` on keyboard activation; DropdownMenu links trigger and menu with `aria-controls`/`aria-labelledby`; Tooltip merges (rather than replaces) a consumer's `aria-describedby` and skips Fragment children.

- [#6555](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6555) [`b36701e`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/b36701ee4fbe5aac48d6f84f8599bd720d0f372d) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - a11y iteration 4: Tabs and Collapsible/Accordion no longer emit dangling `aria-controls`; Tabs routes `aria-label`/`aria-labelledby` to the tablist; Tabs and SegmentedControl keep a keyboard tab stop when the selection matches nothing.

- [#6434](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6434) [`43f4549`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/43f454916a279bfd7b74c520f0b365040913a92e) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Fix `AvatarGroup`'s "+N" overflow badge: it had no accessible name (a bare `<div aria-label>` with no role is prohibited from naming per ARIA, and its only text was `aria-hidden`) and its badge text failed WCAG AA contrast against the matte background. The badge now renders `role="img"` and uses `--rialto-text-primary` for its text color.

- [#6553](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6553) [`483b9c2`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/483b9c2b04c193f396f9c3477b73cafc0498f527) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - ChatPanel now surfaces `permission_denied` events (a blocked-tool alert) and `tool_status` events (a status line naming the running tool) from the chat stream instead of ignoring them. `useChatStream` returns the new `activeTool` and `permissionDenials` fields.

- [#6476](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6476) [`c2968b7`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/c2968b70d49b82933f7c1b602ce672a2fd8377ef) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `useCombobox` in `inputMode: "input"` no longer calls `preventDefault` on Enter when the list is open but no option is focused, so Enter submits the surrounding form per the ARIA APG editable combobox. This affects Autocomplete and direct `useCombobox` input-mode consumers; Combobox handles open + Enter itself and is unchanged. Enter on a focused option still commits and prevents default.

- [#6490](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6490) [`9068217`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/9068217728fb31b616dde5da03611d29d15aa1e5) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `useCombobox` in `inputMode: "input"`: ArrowUp on an open list with no option highlighted now moves to the last enabled option (ArrowDown still moves to the first), instead of doing nothing. Matches the closed-list behaviour and the ARIA APG.

- [#6542](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6542) [`87b1d68`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/87b1d683d1bb8c528be11e6a374749427c0207f2) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `CommandPalette` no longer drops items whose `group` is missing from the `groups` prop. `groups` now controls order only: listed groups render first, and any other group that has items is appended after them.

- [#6419](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6419) [`3b2f1f3`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/3b2f1f39af26f3bcd51d44551aadf1d2fb9f34ca) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - fix: one Escape now closes only the topmost open overlay. `useEscapeKey` keeps a module-level overlay stack, so a Dialog over a Drawer, or a Popover inside a Dialog, no longer both close on a single keypress; the next Escape reaches the layer beneath. Hook signature unchanged.

- [#6472](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6472) [`c6b1654`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/c6b1654bd75e34e36395cef019384bdcf0677879) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Table renders a column's `ariaLabel` as visually-hidden text inside the `<th>` when `header` is empty, so axe's `empty-table-header` rule (which needs text content, not `aria-label`) passes. Visible layout is unchanged.

- [#6544](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6544) [`8860d89`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/8860d89b8b342ff839c9b07b0346f22835fa0ef0) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Toast catalog metadata is now `include: false`: it has no declarative renderer, so the AI catalog prompt no longer offers it.

## 0.5.1

### Patch Changes

- [#6333](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6333) [`e29fefc`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e29fefc09fa01d9441566f05111965848d1d3624) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Finish ADR-025: Avatar, DepartureBoard, Ferrofluid, Handshake, NeonSign, SilkFlow, SplitFlap, WatchLoader and `useScrollReveal` now read reduced motion from `useMotionPreset().reduced` instead of framer-motion's `useReducedMotion()`, and `useBoop` takes its spring from the preset rather than the deprecated `boop` token. `useDeviceContext` now reads the device on its first render, so reduced-motion users never get one commit of the animated path. Full-motion behaviour is unchanged.

## 0.5.0

### Minor Changes

- [#6328](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6328) [`a86c3a4`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/a86c3a4bda582ab04f8c5f87cd6be8a43b1d9e6e) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `useMotionPreset()` now owns reduced motion and boop (ADR-025). It returns two new fields — `reduced` (the one `prefers-reduced-motion` signal) and `boop` (a ready `whileHover` target, at-rest under reduced motion) — and 38 components and hooks now resolve their transitions, boop hover, and reduced-motion check through it instead of importing `tokens/motion` statics or calling framer-motion's `useReducedMotion()`.

  Behaviour change: under reduced motion, Popover, DropdownMenu, ContextMenu, HoverCard, ToastAnimated, and AnimatedTag now transition in zero time (previously 0.1s), and Button/Dialog's previously ungated `precision` transitions are instant too. The `boop` and `reduced` exports of `./motion` are deprecated in favour of `useMotionPreset()`; nothing is removed.

## 0.4.2

### Patch Changes

- [#6324](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6324) [`30f6f21`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/30f6f2128ca3058339990e93a9de98c0e4ad521b) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Fix axe-serious findings on `TapeChart` and `SegmentedControl`: unselected `SegmentedControl` segments now use `--rialto-text-secondary` (was tertiary, 4.07:1 on the recessed track), checked-in `TapeChart` bar metadata uses primary text (was 4.33:1), and the horizontally scrolling `TapeChart` grid is keyboard-focusable.

## 0.4.1

### Patch Changes

- [#6309](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6309) [`638ea70`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/638ea70420ed12edf417e1ef4c7f8b24d6957bc4) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add optional `ariaLabel` to `Table` column definitions, giving a visually empty header (e.g. a trailing actions column) an accessible name.

## 0.4.0

### Minor Changes

- [#6298](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6298) [`78a3a5a`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/78a3a5abe633016405619a4d20fc1d8f36b799f9) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Add optional controlled `open` / `onOpenChange` props to `Popover` (uncontrolled behaviour is unchanged). `DatePicker`, `DateRangePicker` and `TimePicker` now close via controlled state instead of remounting the popover.

## 0.3.4

### Patch Changes

- [#6262](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6262) [`bc4f92c`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/bc4f92cc20e3fade846d19c1acc7d6c5837a8f9a) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Tag `error` variant: deepen text color toward `--rialto-text-primary` so it meets WCAG AA 4.5:1 (axe color-contrast) in light and dark themes.

- [#6271](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6271) [`58903c5`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/58903c5e9a4f89fe5af8f63bd15f2543fa426253) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Tag: keep the variant tint on hover for interactive error/success tags so text stays at 4.5:1 contrast (was surface-matte, 4.2:1 in dark).

## 0.3.3

### Patch Changes

- [#6251](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6251) [`c4b91d4`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/c4b91d4debcbb81bb399a9e293ca063eefd195ce) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Footer: add `linksLabel` prop (default "Footer links") so the rich variant's link-columns nav can be given a unique accessible name when several footers share a page (axe `landmark-unique`).

## 0.3.2

### Patch Changes

- [#6237](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6237) [`8332525`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/83325253c2686eddb9cb2c98a04f2aaaac282d14) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - NavigationMenu: keep the dropdown open when keyboard focus moves from the trigger into the panel (previously the trigger blur armed a close timer that nothing cancelled, stranding focus on `<body>`).

- [#6197](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6197) [`0fdb5a4`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/0fdb5a4d35d9444cf713f98ba8fc6d1229205501) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - A11y iteration 2 (form components): Select exposes `aria-required` and names its listbox from `aria-label`/`aria-labelledby`; NumberInput ignores arrow keys and disables its steppers when `readOnly`; PinInput cells carry `aria-invalid`/`aria-required`; Autocomplete names its listbox, clears `aria-activedescendant` when closed or empty, closes on Tab, and merges a consumer `aria-describedby` with its hint.

- [#6228](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6228) [`3f7f693`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/3f7f693769aaf02c26b7b967bc4d4ee418bc11ab) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Memoize Combobox filtered options so they are not recomputed on unrelated re-renders.

- [#6240](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6240) [`f8836d8`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/f8836d8698dfe2f4bb1c096a421a643e38cad09c) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Resolve Alert, Autocomplete, Banner, Combobox, Tooltip, PinInput, ImageUpload and Slider motion configs through `useMotionPreset()` (ADR-025) instead of importing `tokens/motion` directly. Autocomplete and Banner dropdown/entrance transitions now collapse to an instant transition under reduced motion.

- [#6232](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/6232) [`d77ae3a`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/d77ae3a048d062d85ee4f4c77eef06f1d61e465b) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - TapeChart: stabilize the `leadingHeader` element passed to `TapeChartDayHeader` so its `memo` skips re-renders on focus/selection changes.

## 0.3.1

### Patch Changes

- [#5937](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5937) [`e510f81`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e510f81b563e2552235e566ede9f03595044f7af) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **useFocusTrap: skip disabled elements when choosing a trap candidate** — `FOCUSABLE_SELECTOR` (shared by `Dialog`, `Drawer`, and every other overlay built on `useFocusTrap`) previously matched `button`/`input`/`select`/`textarea` elements regardless of `disabled` state. A panel whose first (or only) focus candidate was disabled silently failed to receive initial focus, since `.focus()` on a disabled element is a no-op. Disabled elements are now excluded from both initial focus and Tab-wrap; `[href]` links (which have no native `disabled` attribute) are unaffected.

- [#5992](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5992) [`43fb645`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/43fb6451a35afe4104cc33cb8fb19da158a4146e) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **TextArea: set `aria-invalid` when the character counter goes over the limit** — the "over limit" state (derived from `maxLength`) previously turned the counter text red and announced once via a polite live region, but never set `aria-invalid` unless the consumer also explicitly passed `error`. A screen-reader user tabbing back to an over-limit field got no persistent invalid signal, while a sighted user saw it continuously via the red counter. `aria-invalid` is now set from `error || isOver`, matching the sighted experience.

## 0.3.0

### Minor Changes

- [#4818](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4818) [`a2421e5`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/a2421e5a58fff788a8203b18c0b3ae09b1b89723) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Checkbox: uncontrolled mode via new `defaultChecked` prop** — a `Checkbox` rendered without `checked`/`onCheckedChange` previously stayed permanently unchecked (React pinned the input at the `checked = false` default). It now holds internal state seeded from `defaultChecked` when `checked` is not provided, updated on the input's `onChange` handler. Fully controlled usage (`checked` + `onCheckedChange`) is unchanged.

  The `required` prop, previously declared on `CheckboxProps` but never applied, now reaches the native input as `required` and `aria-required`.

- [#3881](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/3881) [`3f16018`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/3f160185e7706ffeed2be6bb18405a961830d8df) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **BREAKING: `DateRange` migrated from `Date` objects to `yyyy-mm-dd` ISO strings** (ADR-024), matching the vocabulary `Calendar`/`DatePicker` already use.

  - `DateRangeValue`'s `start`/`end` fields are now `string | null` (was `Date | null`)
  - `DateRangeProps.min`/`max` are now `string` (was `Date`)
  - `isDateDisabled`'s parameter is now an ISO `yyyy-mm-dd` string (was `Date`)

  Migrate consumers by replacing `Date` construction/formatting at the `DateRange` boundary with plain ISO strings, e.g. `new Date(2026, 6, 15)` → `"2026-07-15"`.

- [#3959](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/3959) [`6dc1aaa`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/6dc1aaa6a0a3668cb9d74d897e8e3b4f73c06c60) Thanks [@claude](https://github.com/apps/claude)! - Add `DateRangePicker` — a popover-hosted date-range field composing `Popover` + `DateRange`. Controlled via a `DateRangeValue` of ISO `yyyy-mm-dd` strings, matching the vocabulary `Calendar`/`DatePicker`/`DateRange` already share (ADR-024). Picking the first endpoint keeps the popover open; completing the range (or pressing Escape) closes it and returns focus to the trigger.

- [#4720](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4720) [`1d61892`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/1d61892037ec6e1ecd0ef673460d6a4ae811092a) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **New `Handshake` instrument** — visualises a multi-party exchange (an OIDC sign-in, a webhook confirmation, a device pairing) as LED-capped stations joined by recessed grooves.

  - `stations` (two or more names, in track order) render as `StatusLED`s; `state` is `"idle" | "negotiating" | "settled" | "failed"` (default `"negotiating"`); `lane` picks which leg carries the credential and clamps to the nearest leg.
  - While `negotiating`, a single gold credential pulse shuttles along the active leg and its endpoint LEDs breathe — the only place the accent appears. `settled` re-lights every LED with the success token; `failed` lights the active lane's endpoints with the error token; `idle` is dark.
  - Renders as `role="img"` with a required `aria-label`; the track is `aria-hidden`. `prefers-reduced-motion` parks the pulse mid-groove (`data-reduced-motion`). `size` `"sm" | "md" | "lg"`, `showLabels` to hide station names. Exposes `data-state` and `data-lane` on the root.

- [#5579](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5579) [`a0fdf53`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/a0fdf53d35ee1d7019cbd7d255a3d2c772b9acf0) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **New component `Letterboard`** — a vintage diner letterboard that renders text as individual moulded letter pieces slotted into the ridges of a recessed plate, each piece independently ink (black) or accent (red). Takes `lines`, where a row is either a plain string (all ink) or a list of `{ text, accent }` runs, plus `size` (`sm`/`md`/`lg`) and `align` (`start`/`center`/`end`). Purely presentational and motionless — a letterboard only changes when somebody's hands change it.

  Accessible text is not the tiles: the plate is `aria-hidden`, and the sign's words are rendered separately as ordinary visually-hidden paragraphs (one per row, author casing preserved), with accent runs marked `<strong>` so the red never carries meaning on its own. Every colour resolves to an existing base token — the letter pieces sit on `--rialto-surface` with `--rialto-text-primary` / `--rialto-error` glyphs, the pair already measured at WCAG AA in both themes.

- [#4784](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4784) [`12227d6`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/12227d63f8b4cc2c53d4ff75c3494724024e07b9) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **New `NeonSign` instrument** — visualises a venue's trading state as a neon tube spelling OPEN on a recessed housing, with the fact stated in words beneath it.

  - `state` is `"open" | "opening-soon" | "closed" | "unset"` (required — a sign with no state would be a lie). `open` lights the tube with the success token and strikes on when entered; `opening-soon` warms it gold and breathes — the only place the accent appears; `closed` is dark glass on the plate; `unset` drops the tube and the plate for a dashed outline.
  - Owns no clock and no timezone: the consumer derives the state and the label. Renders as `role="img"` with a required `aria-label` that is also the visible caption (`showCaption` to hide it); housing, tube and caption are `aria-hidden`.
  - All motion is opacity-only CSS keyframes bound to `data-state`, so no React state or effect drives it. `prefers-reduced-motion` removes the strike and parks the breathe (`data-reduced-motion`). `size` `"sm" | "md" | "lg"`. Exposes `data-state` on the root.

- [#3962](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/3962) [`9c3dfbd`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/9c3dfbdffe4e532bf801ca24f8e5930bc8be67c0) Thanks [@claude](https://github.com/apps/claude)! - **AuthMascot — removed.** The `AuthMascot` component and its `MascotState` type have been removed from the design system. It was a decorative element carrying a per-component accessibility/reduced-motion maintenance cost that no longer fits the design direction. The `@mattbutlerengineering/rialto/AuthMascot` subpath export, the `MascotState` type export, and the catalog registry entry are gone. Consumers rendering `<AuthMascot />` must remove the import and render call; there is no drop-in replacement.

- [#4655](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4655) [`b64f413`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/b64f41327ba7db4c1d5a2c5d1d28a4481bc45ce4) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **TapeChart: overlapping reservations now render as per-row lanes with a classified overlap state** (backfilled for [#4442](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4442) / `e4c30808`, which shipped without a changeset)

  - New public `classifyOverlap?: (a, b) => TapeChartOverlapKind` prop decides whether two reservations whose visible spans overlap in one room are a `"conflict"` or `"shared"` occupancy. Called once per overlapping pair, earlier start first. Default: every overlap is a conflict. Cancelled and no-show reservations never reach the classifier.
  - Every positioned bar gains an `overlap?: TapeChartOverlapKind` field — the worst kind across every pair the bar belongs to (`conflict` beats `shared`), absent when the bar overlaps nothing. Rendered as `data-overlap` and `data-lane` / `--tapechart-bar-lane` on the bar; rows expose `data-lane-count` / `--tapechart-lane-count`.
  - New `overlapLabels` strings (default `{ conflict: "Double-booked", shared: "Shared occupancy" }`, deep-merged like `statusLabels`); `TapeChartFormattedParts` gains `overlapLabel`, spoken right after the status in the default reservation aria template.
  - Row-height behavior change: a room whose reservations overlap now grows by one lane pitch per extra lane (derived `--tapechart-lane-pitch`), so overlapping bars sit in their own lanes instead of stacking on top of each other. One-lane rows are pixel-identical to before. Conflict bars get the error-family tint, a red inline-start edge, and a 12px conflict glyph before the title.

- [#4816](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4816) [`ddf6994`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/ddf6994aae6c89875e3bfe96aae3f00c5efd3fcd) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Toast: optional `action` button (`action?: { label, onClick }` on `ToastData`) — renders an inline action in the toast and dismisses on activation. Powers undoable flows like the drivers demo's delete Undo.

### Patch Changes

- [#4965](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4965) [`faea428`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/faea42888bbe86bd5f36fd26102b941fb0bd2d74) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`Autocomplete`: memoize the filtered options list** — `filtered` (and the `comboboxItems` alias fed into `useCombobox`) is now computed via `useMemo`, keyed on `options` and the current input value, instead of running a full `.filter()` over the entire options list on every render. Matches the pattern already used in `CommandPalette`. No behavior change — this is purely a stability/perf fix for unrelated re-renders.

- [#5471](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5471) [`266b9bc`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/266b9bc9cedb44a2f47fed6a41b2d46365b32667) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Button: 44px touch-target floor on `size="sm"` under coarse-pointer (touch) devices** — the compact `.sm` size variant rendered at 23px tall with no minimum, well under the WCAG 2.5.8 target-size minimum for touch. `Button.module.css` now adds `min-block-size: 44px` to `.sm` scoped strictly behind `@media (pointer: coarse)`, so mouse/trackpad density is unchanged and every existing `size="sm"` call site picks up the fix automatically.

- [#5721](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5721) [`55619f0`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/55619f048a7c5126b75de6124f99e4d9bab4157e) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Documented: `ChatPanel` is not usable from a registry install.** `ChatPanel` (and its `useChatStream` hook) imports `@mbe/api-client/streaming`, a private, workspace-only package that is never published anywhere. Rialto's build externalizes that import rather than bundling it, so a registry consumer would need to supply `@mbe/api-client` themselves — not possible outside this monorepo, since the package isn't resolvable from any registry. `ChatPanel` is therefore usable only by workspace-internal consumers of this monorepo. See the README's new Compatibility section.

- [#5086](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5086) [`24bbdf8`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/24bbdf88f4f30f966c52bdec23e57a24845f757e) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `ChatPanel` now surfaces send failures inline as an assistant-side error message with a "Try again" action, instead of silently leaving the composer stuck. `useChatStream` gained a `retry()` that replays the last request without requiring the user to retype it.

- [#4844](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4844) [`0048e92`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/0048e92746eb76114a786e36e40b692e0020a229) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Reliable error announcements in `Combobox`** — the error hint now announces via a freshly-mounted `role="alert"` element (mutually exclusive, distinctly-keyed from the plain hint span) instead of toggling `role="alert"` on an always-mounted node. `role="alert"` is spec-reliable on insertion-with-content; toggling `role` on a pre-existing node is not guaranteed to announce. Converges `Combobox` on the shape [#4841](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4841) already applied to `Input`, `NumberInput`, `PinInput`, `Select`, and `TextArea`. The listbox's polite live region (open/loading/result-count announcements) is unaffected — it was already a separate, always-mounted node.

- [#5316](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5316) [`3749ed1`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/3749ed125a6ed002ae88d6cd7e816d5133733eb3) Thanks [@claude](https://github.com/apps/claude)! - **`rankCommandMatch` now matches its own JSDoc** — the exported `CommandPalette` ranking helper trims its `query` argument before matching and returns `null` (not `0`) for an empty or whitespace-only query, as documented. Internal callers already pre-trim, so `CommandPalette`'s own ranking behavior is unchanged.

- [#5269](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5269) [`e081648`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e0816489007c45db91ca3c22ba9ce281432cbac7) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`CommandPalette` ranks its matches** — results are ordered by how well each label matches the query instead of by `items` order: a label that starts with the query ranks above one where a later word starts with it, above a plain substring, above an initials match; groups reorder by the best match they contain (ties keep `groups` order), so Enter and ArrowDown act on the strongest match rather than the first group's first item. The initials match is now strict — each query character has to open the next word and the query cannot be longer than the label has words — so "walk" no longer surfaces "Waitlist". The rule is exported as the pure `rankCommandMatch(label, query)` (`0 | 1 | 2 | 3 | null`) for consumers that want to apply it themselves. An empty query still lists every item in `groups` order.

- [#5269](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5269) [`e081648`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e0816489007c45db91ca3c22ba9ce281432cbac7) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`Drawer` gains `size="compact"`** — a fourth size for a panel that sits beside a working surface rather than replacing it. `side="bottom"` renders at `min(40vh, 240px)` (a tablet bottom sheet that leaves the rows above it readable — `default`'s `min(50vh, 480px)` covered all but three); `side="right"` / `side="left"` render at `min(320px, calc(100vw - 48px))`. The three existing sizes are unchanged.

- [#5708](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5708) [`c13da22`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/c13da225d5c8275adf43f3131880401e78417703) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`DropdownMenu`: fix focus not returning to the trigger on close** — `useReturnFocus` captured `document.activeElement` in a plain `useEffect`, but `DropdownMenu`'s own "focus the first menu item on open" effect runs in a `useLayoutEffect`, which always flushes before passive effects regardless of hook-declaration order. That meant `useReturnFocus` captured the just-focused menu item as "the trigger" instead of the element that actually opened the menu, so closing the menu (Escape, selecting an item, or clicking the trigger again) left focus stranded on the menu instead of returning it. `useReturnFocus`'s capture now runs in a `useLayoutEffect` too, so it always wins the race against any consumer that moves focus into its panel from a layout effect. Dialog, Drawer, CommandPalette, Popover, and ContextMenu already captured correctly (their focus-stealing effects are passive) and are unaffected.

- [#5087](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5087) [`d822a96`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/d822a96e07bee8341c397bea16ece57174f74184) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Dialog/Drawer: fix focus trap initial target and restore-on-unmount** — `useFocusTrap` no longer defaults keyboard focus to a dismiss/Close button; it now skips any element marked `data-focus-trap-skip-initial` (Dialog and Drawer mark their Close buttons this way) and falls back to the first remaining focusable element. Consumers can also pass an explicit `{ initialFocus }` ref to `useFocusTrap` to target a specific element.

  `useReturnFocus` now restores focus to the trigger both when `open` transitions to `false` and when the component unmounts entirely while still open (previously only the former was handled) — fixing the case where a parent stops rendering the Dialog/Drawer instead of toggling `open` first.

  Both changes are additive and backward compatible; no existing consumer usage changes behavior unless it relies on the Close button receiving initial focus.

- [#4851](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4851) [`93d2be8`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/93d2be897a4e12a47f431a79906783d7ed02397a) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`Hero` title entrance changes from fade+rise to transform-only rise** — the title is Hero's largest-contentful-paint candidate, and fading it in from `opacity: 0` kept it unpainted until the entrance settled, directly delaying LCP (fixes the ~1387ms render-delay class; Refs [#4847](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4847)). The title now stays fully opaque from first paint and only its position (`translateY`) animates. Eyebrow, subtitle, divider, and actions are unaffected — they keep the original opacity+transform fade-up entrance.

- [#4909](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4909) [`c3e11ef`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/c3e11efeed9855bc8a71effa78fc5b774a75f1af) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Fix `ImageUpload` keyboard bypass of the "Replace" button** — the outer tile's keydown handler stayed active even when a preview was showing, so Enter/Space reopened the file picker directly instead of routing through the nested "Replace" button, diverging from mouse behavior (where the tile's click handler was already gated by `hasPreview`) and nesting a real `<button>` inside an ancestor with `role="button"`. Enter/Space on the tile now no-ops when a preview is present; the "Replace" button remains the way to swap the image. No-preview behavior is unchanged.

- [#4831](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4831) [`7d6fec9`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/7d6fec998af2daec0d84b7d4aa180ca3a88888b1) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`Input`: fixed a duplicate error-message node** — when `error` and `hint` were both set, the hint text was rendered twice: once in the visible hint `<span>`, and again in a separate, always-mounted, visually-hidden `aria-live="polite"` region intended only to announce it to screen readers. Both nodes carried identical text, so any DOM-text query (`textContent`, `getAllByText`) returned the message doubled, even though sighted users only ever saw it once.

  The visible hint `<span>` now doubles as the live region — it gains `role="status"`/`aria-live="polite"`/`aria-atomic="true"` when `error` is true, instead of a second hidden `<span>` echoing the same text. `aria-describedby` still points at the same stable id, and the "announces the error hint via a polite status region" contract is unchanged.

- [#4347](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4347) [`a29a4ae`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/a29a4ae8d01d362e59c5101d5444d6fa84efff56) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Two accessible-name/value defects fixed — both invisible to axe.**

  `SegmentedControl` spread `{...props}` onto its outer wrapper while `role="radiogroup"` sat on an inner element, so an `aria-label` passed by a caller named the wrapper and left the radiogroup itself unnamed — for every consumer. `aria-label` and `aria-labelledby` now reach the radiogroup; all other props still land on the wrapper. No API change.

  `Meter` reported `aria-valuenow="0"` when it had no value, announcing a definite zero where the truth was unknown. `value` now accepts `null` for "no data". Because `role="meter"` requires `aria-valuenow` and has no ARIA spelling of "unknown", the indeterminate case renders as `role="progressbar"` with `aria-valuenow` omitted — the one role whose contract defines an omitted value as indeterminate — over an unfilled, dimmed track, with `showValue` showing a placeholder instead of `0%`.

  Determinate `Meter` behaviour is unchanged. `MeterProps["value"]` widens from `number` to `number | null`, which is source-compatible for callers passing a number.

- [#5424](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5424) [`28e5151`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/28e5151c254ee3b2e57c547368b73f604e186b48) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`NavigationMenu`: bridge keyboard focus into dropdown panels** — a `NavTrigger` with children had no `onKeyDown` handler, so ArrowDown/ArrowUp/Home/End/Escape presses while focused on the trigger never reached the panel's existing roving-focus handler, and every child link was `tabIndex={-1}`. Keyboard-only users could open a dropdown but had no way to move focus into it or activate any child link (a WCAG 2.1.1 Keyboard failure). The trigger button now shares the same `onKeyDown` handler as the panel, so ArrowDown from the trigger correctly moves focus to the first child menuitem, and the existing roving behavior continues once focus is inside.

- [#4775](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4775) [`dc42d4f`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/dc42d4fb41c3d3ea5e173e764fa5a4c9d3f941d4) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `PinInput` renders every cell when the value is empty or partial. `chars` was derived via `value.padEnd(length, "").slice(0, length).split("")`, but `String.prototype.padEnd` with an empty fill string is a documented no-op — so an empty `value` rendered zero cells, and a partial value rendered only `value.length` cells instead of `length`. Cells are now derived from `length` directly (`Array.from({ length }, (_, i) => value[i] ?? "")`), so the field always renders exactly `length` cells regardless of how much has been typed. No API change.

- [#4813](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4813) [`6422b34`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/6422b34b852b14000f63c1cd88dc6a92689c3ce2) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Fix `PinInput` `onComplete` never firing. The completion guard was `next.length === length && !next.includes("")`, but `next` is a string and `String.prototype.includes("")` is always `true` — so `!next.includes("")` was always `false` and `onComplete` never fired, on any input. The `includes` check was written for an array (checking for empty cells) but `next` is a string, where `next.length === length` alone already guarantees no empty cells. Removed the dead clause.

- [#5702](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5702) [`1488878`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/14888788929c5d313c4d4fee39fe59c94cc82425) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Popover: trap keyboard focus and add `aria-modal`** — `Popover`'s panel now uses the shared `useFocusTrap` hook (matching `Dialog`/`Drawer`/`CommandPalette`), so Tab/Shift+Tab cycles only within the open panel instead of letting keyboard users tab out into page content behind it. The panel also now carries `aria-modal="true"` alongside its existing `role="dialog"`, so assistive tech's understanding of the panel matches its actual focus behavior.

  Initial-focus behavior is unchanged: the first focusable element in the panel (the Close button, when a `title` is provided) still receives focus on open.

- [#4841](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4841) [`e8f892c`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/e8f892c1798f12b00186a629f3b19cf1ad0c392a) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Reliable, non-duplicated error announcements in `Input`, `NumberInput`, `PinInput`, `Select`, `TextArea`** — error messages now announce via a freshly-mounted `role="alert"` element instead of a conditionally-mounted `role="status"`/`aria-live="polite"` region (Input) or an always-mounted hidden echo region (NumberInput/PinInput/Select/TextArea). `role="alert"` is spec-reliable on insertion-with-content; `status`/`polite` regions are not guaranteed to announce when they are born already populated. This also removes the duplicate DOM text the four siblings carried (visible hint + hidden echo saying the same thing). Non-error announcements (PinInput's "Code complete", TextArea's character counter) are unchanged — they still use the always-mounted polite status region.

- [#3292](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/3292) [`2517346`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/2517346fabc348883787c9a474874d2bcf6e7b76) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **RadialGauge — removed.** The `RadialGauge` analog dial has been removed from the design system. For bounded 0–100 metrics use `Meter`, which exposes the same `role="meter"` accessible contract (value / min / max, visible readout, and label). The `@mattbutlerengineering/rialto/RadialGauge` subpath export, the catalog entry, and the `/components/radial-gauge` showcase page are gone.

- [#5196](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5196) [`2ccf995`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/2ccf9959ea1e95e66ba1692eb03e4c7b215c95de) Thanks [@github-actions](https://github.com/apps/github-actions)! - **Revert: useFocusTrap Tab-wrap boundary re-query at keydown time.** The change shipped in the previous patch (re-querying focusable elements on every Tab keydown instead of once at effect setup) failed post-deploy smoke tests in production and has been reverted via the auto-rollback workflow. `useFocusTrap` is back to querying focusable elements once at effect setup; the dynamic-boundary behavior will be re-investigated in a follow-up issue.

- [#4845](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4845) [`fb80390`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/fb803901b1246b25c3a602fb143af7dae5ba5666) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Build output: `rollupOptions.external` now reads from a shared `libExternal` module** (`packages/rialto/scripts/lib-external.ts`), reused by a new build-source regression test. No runtime behavior changes for consumers — `@mbe/api-client` and its subpaths were already externalized ([#3317](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/3317)); this refactor just adds a gate so a future component can't reintroduce an un-externalized workspace import without a test failing first. See [#4843](https://github.com/mattbutlerengineering/mattbutlerengineering/issues/4843).

- [#4898](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4898) [`d91d34c`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/d91d34ce8aae3efa053c7b90e56d672ca6d8e7ee) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`RialtoProvider` now syncs `<meta name="theme-color">` on theme change** — the two static, media-keyed `theme-color` tags every app ships in `index.html` only track the OS `prefers-color-scheme` query, so an explicit in-page theme toggle (independent of OS preference) left the mobile browser chrome color stale after switching themes. `RialtoProvider` now mutates both tags' `content` to the resolved theme's `--rialto-surface` value on every theme change, keeping the frame in sync with the rendered page. The static tags are left in place unchanged as the pre-hydration/no-JS fallback.

- [#5085](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5085) [`ddae3c0`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/ddae3c00ad4b8fb699098488e70cba4107b26709) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Fix `Select` listbox being occluded by a sibling `Card`** — the open dropdown is now rendered via `createPortal` to `document.body` and positioned imperatively from the trigger's viewport rect, instead of being absolutely positioned inside the trigger's wrapper. Previously, any ancestor with a CSS stacking context (e.g. `Card`'s `position: relative` + transform-based hover lift) trapped the dropdown's `z-index`, so a `Select` followed by another `Card` painted the listbox underneath that sibling — a mouse/touch click intended for an option landed on the sibling instead (keyboard selection still worked). `useCombobox`'s outside-press detection gained an additive `extraContainerRefs` option so a portaled listbox is still treated as "inside" for dismiss purposes.

  The dropdown's `z-index` is raised from `50` to `10000` — the portal escapes into the root stacking context, where it now shares space with every other non-portaled rialto overlay (`Dialog`/`Popover`/`DropdownMenu`/`NavigationMenu`/`Combobox` at `100`, `Drawer`/`CommandPalette` at up to `9999`). At `50` the dropdown lost to all of them, reproducing the exact occlusion this fix was written for — just relocated from `Card` to any overlay a `Select` is nested inside (e.g. a `Select` inside a `WalkInDialog`/`NewReservationDialog` in `apps/hospitality`).

- [#4911](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4911) [`b0973ca`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/b0973ca747ab0a88d0865efb74b15a0d733a77fa) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **Fix `Table` sortable column headers' accessibility semantics** — sortable headers put `onClick`/`onKeyDown`/`tabIndex` directly on the `<th role="columnheader">`, which has no operable semantic role, so many screen readers never announced them as actionable. The click/keyboard interaction now lives on a nested `<button type="button">` wrapping the header label and sort icon (matching the pattern already used by `DataTable`), while `aria-sort` and `role="columnheader"` stay on the `<th>`. Non-sortable columns are unchanged.

- [#3849](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/3849) [`41da868`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/41da8685d01dd26464108163dfc1fe62eeb30e56) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - Fix Toast container overflowing the viewport on screens ≤480px: the mobile media query anchors the fixed container with both inline insets but inherited `width: 100%`, which over-constrains the box and pushes it past the right viewport edge by the start inset. The container now sizes from its insets (`width: auto`).

- [#5047](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5047) [`c8431d8`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/c8431d80f19e704f9d714a780b4c7a485f6b63a4) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - `Tooltip`'s `show()` armed a new `setTimeout` on every call without clearing the previous one, so a single ref could only ever track the most recent timer. Since the wrapper binds `show` to both `onMouseEnter` and `onFocus`, hovering a trigger and then clicking it fired `mouseEnter` and `focus` in sequence — two `show()` calls before any `hide()` — orphaning the first timer. `hide()` could no longer reach it, so moving the pointer away and tabbing away left a ghost timer that reopened the tooltip after the delay with nothing hovered or focused. `show()` now keeps at most one pending timer (a no-op if one is already armed, anchoring the delay to the first trigger rather than restarting it on the second), and a new unmount effect clears any pending timer so a trigger that unmounts inside the delay window doesn't leak one. No API change.

- [#5405](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/5405) [`49636ec`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/49636ec10e6ced6540b29f7ae7f927e71c35f9cd) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - **`useEscapeKey` ignores an Escape whose default was already prevented** — a listbox nested inside a `Dialog`/`Drawer` (rialto `Autocomplete`/`Combobox`, or an app composition over `useCombobox`) calls `preventDefault()` on the Escape that closes it; the overlay's document-level handler now treats that as "already consumed" and no longer closes on the same keypress. An unconsumed Escape closes the overlay exactly as before.

- [#4732](https://github.com/mattbutlerengineering/mattbutlerengineering/pull/4732) [`ce6aab0`](https://github.com/mattbutlerengineering/mattbutlerengineering/commit/ce6aab04a2b701f868cac5fa899ea1eb3a6b5e3d) Thanks [@mattbutlerengineering](https://github.com/mattbutlerengineering)! - WatchLoader: fix the caseback so it reads as a movement, not a clutter of overlapping parts.

  - The rotor now spins on its pivot. Its group's bounding box was asymmetric (half-annulus + weight), so `transform-box: fill-box` rotated it about a point 19 units above the axle and it wobbled; a bearing race circle makes the bounds symmetric.
  - Re-laid the movement: the balance wheel no longer sits on top of three gears, and the centre/third wheels' bodies no longer intersect. The layout is pure data (`movement.ts`) with a clearance test.
  - Balance swing and escape-wheel ticks are CSS keyframes (`ease-in-out` pendulum, `steps(15)` ticks) instead of a `setInterval`-driven spring — no JS timers, everything on the compositor, and the reduced-motion snapshot now parks every part and ghosts the rotor so the movement beneath still reads.
  - Thinner, slightly translucent rotor; visible centre hub; bridges get an edge so they read on the plate.

## 0.1.12

### Patch Changes

- **TapeChart — layout fix.** Two long-standing CSS grid bugs (since component introduction in `d27300e`): `.gridBody` was a 2-col grid whose 25 direct children got auto-placed into alternating columns, producing a 2-rooms-per-row layout; `.dayHeader`'s template didn't reserve a column for the leading "Rooms" header, pushing the last day cell to wrap onto a second row. Fixed by switching `.gridBody` to `flex-direction: column` and prepending a `roomCol` track to `.dayHeader`'s grid template. Visible symptoms went away at 24 rooms × 14 days; smaller consumers may not have noticed.

## 0.1.11

### Patch Changes

- **MasterOverride — hold-to-engage (`requireHold`):** opt-in dead-man-switch mode that requires pressing and holding the switch for a threshold (default 1000ms, clamped to [250, 5000]ms) before it engages. Asymmetric by design — disengaging remains a single click. Works with pointer (`pointerdown`), keyboard (Enter or Space, ignoring OS key-repeat), and cancels cleanly on `pointerup`, `pointerleave`, `keyup`, or pointer release outside the element. A gold conic-gradient progress ring fills around the switch track during the hold (driven by a Framer `MotionValue` via CSS custom property, so 60fps visual updates cause zero React re-renders). Live region announces hold start ("Hold to arm {label}"), cancel ("Arming cancelled"), and success ("{label} engaged"); announcements self-clear via a snapshot pattern when `armed` or `on` subsequently change.
- **MasterOverride — `labelTransition="splitflap"`:** opt-in replacement of the crossfaded `idleLabel` / `activeLabel` spans with a single `SplitFlap` mechanical cell above the switch track. Cascades between values on toggle using the library's flagship Solari-style primitive. Length defaults to `max(idleLabel.length, activeLabel.length)`; override with the new `labelLength` prop.
- Both features are additive and opt-in — existing consumers see no behavioral or visual change.

## 0.1.10

### Patch Changes

- **New primitive — `Heading`:** dedicated semantic heading with decoupled `level` (1–6, drives the rendered `h{level}` tag) and `size` (1–6, visual override). Sizes 1–4 use the display font (Bricolage Grotesque) for page/section titles; sizes 5–6 switch to the sans font with medium weight for UI-chrome headings (Dialog, Drawer, Card, etc.) — matches the design system rule reserving the display font for hero/page titles. Mirrors `Text`'s `color` / `align` / `truncate` / `as` API for a consistent authoring surface.
- **Consumer refactors:** `PageHeader`, `Dialog`, `Drawer`, and `ErrorBoundary` now use `Heading` instead of hand-rolled `<h1>` / `<h2>` with bespoke `.title` styles. Each consumer's CSS is pared back to layout-only concerns (margin, color, line-height). Chalkboard intentionally stays on its chalk-script theme — routing it through Heading would strip everything Heading provides.
- **Fix — `MasterOverride`:** state labels (`STANDBY` / `ENGAGED`) were absolutely positioned inside the switch track and the lever clipped them across its travel. Labels now sit on the housing as siblings of the track, with `justify-content: space-between`. Lever travel bumped from 42% → 75% so it visually reaches the end-stops like a real hardware toggle. Asymmetric padding on `.switchBody` keeps the stacked column fitting the `sm` bezel.

## 0.1.9

### Patch Changes

- **Avatar visual refresh:** machined-aluminum gradient face with hairline bezel, recessed LED status dots that glow in their own hue and gently breathe on live states (online / busy / away), and engraved initials fallback via a two-pass text-shadow. All motion honors `prefers-reduced-motion`.
- **Avatar splitflap swap:** new `transition="fade" | "splitflap"` prop. With `"splitflap"`, changing `src` runs the image through a two-flap horizontal reveal that mirrors the library's `SplitFlap` aesthetic. Default `"fade"` preserves the legacy crossfade.
- **Avatar internals:** replaced the boolean `imgFailed` flag with a `failedSrc` derivation so a fresh URL is retried automatically (removes a cascading-render effect).

## 0.1.8

### Patch Changes

- **New component:** `TapeChart` — hospitality rack-chart component. Grid of day-cells per room with reservation bars overlaid, suited for front-desk occupancy views.
- **Bug fix:** `SplitFlap` back-face rendering — removed a redundant back-face `div` from each cell and corrected an earlier overcorrection. Animation now uses a single transformed face per digit.

## 0.1.7

### Patch Changes

- **Build:** Add `types` field + stub `.d.ts` to the `./styles` subpath export. Without it, consumer apps building under TypeScript bundler resolution failed with `TS2882: Cannot find module or type declarations for side-effect import of '@mattbutlerengineering/rialto/styles'` after the 0.1.6 multi-entry export changes activated stricter resolution.

## 0.1.6

### Patch Changes

- **Accessibility:** Remove `aria-disabled` from `readOnly` inputs (`TextArea`, `NumberInput`) — `readOnly` is sufficient on its own and the coexistence was an anti-pattern.
- **Accessibility:** `NumberInput` now sets `aria-invalid="true"` when in error state (mirrors `Input` behavior).
- **Tree-shaking:** Per-component subpath exports via multi-entry Vite build. Consumers importing `Button` from the root barrel now pull ~5.7 kB instead of 245 kB (-97.7%). Direct subpath imports (`@mattbutlerengineering/rialto/Button`) pull ~1.3 kB. Root barrel import still works unchanged.
- **Release machinery:** Wired up Changesets for automated version bumps and CHANGELOG generation — future releases run via `pnpm changeset` + `pnpm version-packages`.

## 0.1.5

### Patch Changes

- New components: `MasterOverride`, `SplitFlap`, `Chalkboard`, `SplitScreenExit`, `Ferrofluid`.
- Accessibility fixes for overlay components (focus management and ARIA on Dialog / Popover / Sheet).
- Post-`/simplify` refactor across the new components (token usage, prop API cleanup, reduced bespoke CSS).

> Releases prior to 0.1.5 were published manually and are not catalogued here.
> Future entries will be generated automatically by [Changesets](https://github.com/changesets/changesets).
