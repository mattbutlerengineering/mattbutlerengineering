---
"@mattbutlerengineering/rialto": patch
---

**TextArea: set `aria-invalid` when the character counter goes over the limit** — the "over limit" state (derived from `maxLength`) previously turned the counter text red and announced once via a polite live region, but never set `aria-invalid` unless the consumer also explicitly passed `error`. A screen-reader user tabbing back to an over-limit field got no persistent invalid signal, while a sighted user saw it continuously via the red counter. `aria-invalid` is now set from `error || isOver`, matching the sighted experience.
