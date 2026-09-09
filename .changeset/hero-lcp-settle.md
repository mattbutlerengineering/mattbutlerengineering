---
"@mattbutlerengineering/rialto": patch
---

**`Hero` title entrance changes from fade+rise to transform-only rise** — the title is Hero's largest-contentful-paint candidate, and fading it in from `opacity: 0` kept it unpainted until the entrance settled, directly delaying LCP (fixes the ~1387ms render-delay class; Refs #4847). The title now stays fully opaque from first paint and only its position (`translateY`) animates. Eyebrow, subtitle, divider, and actions are unaffected — they keep the original opacity+transform fade-up entrance.
