---
"@mattbutlerengineering/rialto": patch
---

BarChart scales a k/m/b suffix only when it directly follows the number (optionally after one space) and is not the start of a word. "5 per week" and "12 kg" read as 5 and 12, while "$20k", "12 k" and "$3.4M revenue" still scale.
