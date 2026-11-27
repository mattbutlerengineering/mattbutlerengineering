---
"@mattbutlerengineering/rialto": patch
---

perf(Hero): the subtitle settles into place without fading from opacity 0, so it paints on first frame. On mobile it is the LCP element and its fade delayed LCP (#9915).
