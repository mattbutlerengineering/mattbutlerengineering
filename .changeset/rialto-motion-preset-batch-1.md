---
"@mattbutlerengineering/rialto": patch
---

Resolve Alert, Autocomplete, Banner, Combobox, Tooltip, PinInput, ImageUpload and Slider motion configs through `useMotionPreset()` (ADR-025) instead of importing `tokens/motion` directly. Autocomplete and Banner dropdown/entrance transitions now collapse to an instant transition under reduced motion.
