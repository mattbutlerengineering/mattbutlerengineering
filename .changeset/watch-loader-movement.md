---
"@mattbutlerengineering/rialto": patch
---

WatchLoader: fix the caseback so it reads as a movement, not a clutter of overlapping parts.

- The rotor now spins on its pivot. Its group's bounding box was asymmetric (half-annulus + weight), so `transform-box: fill-box` rotated it about a point 19 units above the axle and it wobbled; a bearing race circle makes the bounds symmetric.
- Re-laid the movement: the balance wheel no longer sits on top of three gears, and the centre/third wheels' bodies no longer intersect. The layout is pure data (`movement.ts`) with a clearance test.
- Balance swing and escape-wheel ticks are CSS keyframes (`ease-in-out` pendulum, `steps(15)` ticks) instead of a `setInterval`-driven spring — no JS timers, everything on the compositor, and the reduced-motion snapshot now parks every part and ghosts the rotor so the movement beneath still reads.
- Thinner, slightly translucent rotor; visible centre hub; bridges get an edge so they read on the plate.
