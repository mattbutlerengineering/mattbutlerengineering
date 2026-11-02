---
"@mattbutlerengineering/rialto": patch
---

Three accessibility fixes. ImageUpload: the empty tile is named from its visible "Add image" text (plus the label), and the preview tile is no longer a `role="button"` wrapping the Replace button. Dialog takes a `role` prop (`"dialog"` | `"alertdialog"`), and a destructive ConfirmDialog is now `role="alertdialog"` (the default variant stays `dialog`). Inside a Form that renders its error summary, field errors are no longer a second `role="alert"`, so one error is announced once; they stay visible and linked through `aria-describedby`, and a field used outside a Form, or in a Form with `showErrorSummary={false}`, still announces its own error.
