---
"@mattbutlerengineering/rialto": patch
---

Finish ADR-025: Avatar, DepartureBoard, Ferrofluid, Handshake, NeonSign, SilkFlow, SplitFlap, WatchLoader and `useScrollReveal` now read reduced motion from `useMotionPreset().reduced` instead of framer-motion's `useReducedMotion()`, and `useBoop` takes its spring from the preset rather than the deprecated `boop` token. `useDeviceContext` now reads the device on its first render, so reduced-motion users never get one commit of the animated path. Full-motion behaviour is unchanged.
