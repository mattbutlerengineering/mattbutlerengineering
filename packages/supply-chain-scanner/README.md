# @mbe/supply-chain-scanner

Static, **defense-in-depth** scanner that inspects a third-party skill or MCP
package **before** it is installed and emits a structured verdict.

It is a pure static analyzer: it reads the package's text files and runs
heuristics over them. It **never imports, requires, evaluates, or spawns** the
scanned code — so it is safe to point at fully untrusted packages. It is **not**
a sandbox and does not catch obfuscated or runtime-only behavior; treat it as
one layer, not a guarantee.

## Usage

```ts
import { scanPackage } from "@mbe/supply-chain-scanner";

const result = scanPackage("/path/to/candidate-package");
// { verdict: "pass" | "flag" | "block", findings: Finding[] }
```

CLI (exits non-zero on a `block` verdict, so it can gate an install step):

```bash
mbe-scan /path/to/candidate-package
```

## Verdict

- `block` — at least one **high**-severity finding.
- `flag` — at least one **med**-severity finding (and no high).
- `pass` — nothing notable.

## Heuristics

| Category             | High (block)                                                        | Med / Low (flag)                              |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `prompt-injection`   | instruction-override phrasing ("ignore previous instructions")      | role reassignment, hidden unicode, base64 in prose |
| `data-exfiltration`  | secret read **paired with** an outbound call in the same file       | outbound call alone (med), secret read alone (low) |
| `malicious-command`  | `curl … \| sh`, `rm -rf <path>`, `eval(`, dynamic `require/import`, writes to MCP/shell config | raw `child_process` / `exec`/`spawn` (med)    |

Each `Finding` carries `{ category, severity, file, line, evidence }` where
`file` is relative to the scanned package root and `line` is 1-indexed.
