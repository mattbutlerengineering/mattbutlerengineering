# Feedback Routing — Quick Reference

Choosing the right feedback component based on urgency and user impact.

---

## Priority Levels

| Priority | Level      | Component           | Behavior                           | Auto-dismiss |
| -------- | ---------- | ------------------- | ---------------------------------- | ------------ |
| P1       | Critical   | `ConfirmDialog`     | Blocks until user resolves         | No           |
| P2       | Blocking   | `Dialog/Drawer`     | Modal, requires explicit dismissal | No           |
| P3       | Persistent | `Banner`            | Page-level, persists until closed  | No           |
| P4       | Inline     | `Alert`             | Contextual, near the fault         | No           |
| P5       | Transient  | `Toast`             | Auto-dismisses after ~4s           | Yes          |
| P6       | Passive    | `Tooltip/HoverCard` | Hover-only, no interruption        | Yes          |

---

## Decision Tree

```
Is this feedback critical / destructive?
├── Yes (data loss, irreversible) ────────── P1: ConfirmDialog
│
├── No
│   ├── Does the user MUST act before continuing?
│   │   ├── Yes (form, settings, auth) ──── P2: Dialog or Drawer
│   │   │
│   │   └── No
│   │       ├── Is it page-wide scope?
│   │       │   ├── Yes (maintenance, system) ─ P3: Banner
│   │       │   │
│   │       │   └── No
│   │       │       ├── Is it near a specific element?
│   │       │       │   ├── Yes (form error, field hint) ─ P4: Alert
│   │       │       │   │
│   │       │       │   └── No
│   │       │       │       ├── Should user be notified?
│   │       │       │       │   ├── Yes (save, copy, send) ─ P5: Toast
│   │       │       │       │   │
│   │       │       │       │   └── No (supplemental info) ─ P6: Tooltip/HoverCard
```

---

## Routing Algorithm

Use these questions in order. Stop at the first "yes":

1. **Is the action destructive or irreversible?** → `ConfirmDialog` (P1)
2. **Must the user act before proceeding?** → `Dialog` or `Drawer` (P2)
3. **Does it affect the entire page/app?** → `Banner` (P3)
4. **Is it tied to a specific element?** → `Alert` (P4)
5. **Should the user be notified briefly?** → `Toast` (P5)
6. **Is it supplemental hover info?** → `Tooltip` or `HoverCard` (P6)

---

## Comparison Table

| Attribute        | ConfirmDialog  | Dialog/Drawer | Banner       | Alert    | Toast      | Tooltip    |
| ---------------- | -------------- | ------------- | ------------ | -------- | ---------- | ---------- |
| Blocks workflow  | Yes            | Yes           | No           | No       | No         | No         |
| User must act    | Yes            | Yes           | Optional     | Optional | No         | No         |
| Scope            | Action         | Task          | Page         | Element  | Global     | Element    |
| Persistence      | Until resolved | Until closed  | Until closed | Inline   | ~4 seconds | Hover only |
| Focus trapped    | Yes            | Yes           | No           | No       | No         | No         |
| Overlay/backdrop | Yes            | Yes           | No           | No       | No         | No         |
| Stacks           | No             | No            | Yes          | Yes      | Yes        | No         |

---

## Common Mistakes

| Mistake                                   | Impact                             | Fix                                       |
| ----------------------------------------- | ---------------------------------- | ----------------------------------------- |
| Toast for errors that need user action    | User misses error, it auto-hides   | Use Alert (P4) or Dialog (P2) instead     |
| Dialog for success confirmations          | Unnecessary interruption           | Use Toast (P5) — auto-dismisses           |
| Banner for field-level validation         | Too far from the fault             | Use Alert (P4) next to the field          |
| Alert for system-wide announcements       | Buried in page content             | Use Banner (P3) at page top               |
| ConfirmDialog for non-destructive actions | Modal fatigue, slows users down    | Use Toast (P5) or remove confirmation     |
| Tooltip for critical information          | Invisible to keyboard/touch users  | Use Alert (P4) or visible text            |
| Stacking multiple modals                  | Confusing, traps focus incorrectly | One modal at a time; nest feedback inside |

---

## Accessibility Notes

- **P1–P2 (modal)**: Focus trap, Escape to close, `aria-modal="true"`, return focus on dismiss
- **P3 (Banner)**: `role="alert"` for urgent variants, `aria-live="polite"` for informational
- **P4 (Alert)**: `role="alert"` for errors, `aria-live="polite"` for info/success
- **P5 (Toast)**: `role="status"`, auto-dismiss must allow enough reading time (minimum 4s)
- **P6 (Tooltip)**: `role="tooltip"`, `aria-describedby` on trigger, keyboard-accessible via focus
- All dismissible feedback must have a visible close button meeting 24×24px minimum target
