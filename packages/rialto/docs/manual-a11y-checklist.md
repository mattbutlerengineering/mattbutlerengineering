# Manual Accessibility Verification Checklist

This checklist covers runtime behaviors that axe-core cannot detect — screen reader announcements, focus management, and live region behavior. Run these tests with **VoiceOver on macOS** (Safari recommended) or **NVDA on Windows** (Chrome or Firefox).

axe-core validates static ARIA markup. It cannot verify what a screen reader actually announces, whether focus returns to the correct element after a dialog closes, or whether live regions fire in the expected order. These tests fill that gap.

---

## Dialog

**URL:** `http://localhost:3000/rialto/overlays/dialog`

**Setup:** Navigate to the page and locate the "Open Dialog" button in the Basic section.

### Checklist

- [ ] Press Enter on the "Open Dialog" trigger — dialog appears visually
- [ ] Screen reader announces the dialog title ("Confirm Configuration") on open
- [ ] Screen reader reads the description text immediately after the title
- [ ] Tab key cycles through interactive elements (Cancel, Confirm) without escaping the dialog
- [ ] Shift+Tab wraps back to the last element from the first
- [ ] Press Escape — dialog closes
- [ ] Focus returns to the "Open Dialog" trigger button after close (not to body or top of page)
- [ ] Click outside the dialog — dialog closes
- [ ] Focus returns to the trigger after outside-click close

---

## DropdownMenu

**URL:** `http://localhost:3000/rialto/overlays/dropdown-menu`

**Setup:** Navigate to the page and locate the "Actions" button in the Basic section.

### Checklist

- [ ] Press Enter or Space on the "Actions" trigger — menu opens
- [ ] Screen reader announces the menu role on open
- [ ] Arrow Down moves focus to the first menu item and announces its label
- [ ] Arrow Down/Up navigate items with each label announced
- [ ] Arrow keys wrap from last item to first (and vice versa)
- [ ] Press Enter or Space on a focused item — item executes and menu closes
- [ ] Press Escape — menu closes without executing any action
- [ ] Focus returns to the "Actions" trigger after close
- [ ] Items with keyboard shortcuts ("⌘C", "⌘V") announce the shortcut text alongside the label

---

## CommandPalette

**URL:** `http://localhost:3000/rialto/overlays/command-palette`

**Setup:** Click "Open Command Palette" to open the palette. Alternatively, trigger with Cmd+K if globally wired.

### Checklist

- [ ] Palette opens — screen reader announces the combobox role and search input label
- [ ] Typing in the search field filters results
- [ ] Result count is announced via live region as the user types (e.g., "3 results")
- [ ] Arrow Down moves to the first result and announces the command label
- [ ] Arrow Down/Up navigate filtered results with each label announced
- [ ] Press Enter on a highlighted command — command executes and palette closes
- [ ] Press Escape — palette closes without executing any command
- [ ] Focus returns to the element that was focused before the palette opened
- [ ] Keyboard shortcuts displayed in command items are read alongside labels

---

## Toast

**URL:** `http://localhost:3000/rialto/feedback/toast`

**Setup:** Navigate to the page. Toasts are triggered by buttons in the page.

### Checklist

- [ ] Trigger a default toast — announcement is polite (does not interrupt current screen reader reading)
- [ ] Trigger an error toast — announcement is assertive (interrupts current reading)
- [ ] The toast title is the primary announced content
- [ ] The toast dismiss button is reachable via Tab, but focus does not auto-move to the toast on appearance
- [ ] Trigger multiple toasts in quick succession — announcements occur in order of appearance
- [ ] Open browser DevTools and inspect the DOM at page load (before any toast fires) — both `aria-live="polite"` and `aria-live="assertive"` regions exist in the DOM
- [ ] The live regions are present at page load, not injected dynamically when the first toast fires

---

## Notes

- Test with VoiceOver: enable with Cmd+F5 on macOS, use Safari for best compatibility
- Test with NVDA: download from nvaccess.org, use with Chrome or Firefox on Windows
- For focus-return tests, ensure the trigger button is the last focused element before opening the overlay
- Announcement wording varies between screen readers; test the intent (e.g., "dialog title is read on open") not the exact words
