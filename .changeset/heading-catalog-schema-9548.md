---
"@mattbutlerengineering/rialto": patch
---

Heading catalog now validates `level` and `size` (integers 1 to 6), so generated specs cannot render an out-of-range heading such as `<h7>`. Navbar catalog description no longer advertises a search field the catalog does not expose.
