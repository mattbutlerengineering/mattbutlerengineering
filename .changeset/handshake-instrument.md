---
"@mattbutlerengineering/rialto": minor
---

**New `Handshake` instrument** — visualises a multi-party exchange (an OIDC sign-in, a webhook confirmation, a device pairing) as LED-capped stations joined by recessed grooves.

- `stations` (two or more names, in track order) render as `StatusLED`s; `state` is `"idle" | "negotiating" | "settled" | "failed"` (default `"negotiating"`); `lane` picks which leg carries the credential and clamps to the nearest leg.
- While `negotiating`, a single gold credential pulse shuttles along the active leg and its endpoint LEDs breathe — the only place the accent appears. `settled` re-lights every LED with the success token; `failed` lights the active lane's endpoints with the error token; `idle` is dark.
- Renders as `role="img"` with a required `aria-label`; the track is `aria-hidden`. `prefers-reduced-motion` parks the pulse mid-groove (`data-reduced-motion`). `size` `"sm" | "md" | "lg"`, `showLabels` to hide station names. Exposes `data-state` and `data-lane` on the root.
