# @mbe/supply-chain-scanner

Static defense-in-depth scanner for third-party skills/MCP packages before
install — see `README.md` for the full usage/heuristics reference (this file
covers structure and contributing).

## Key Files

```
src/
├── index.ts                        # Barrel export
├── cli.ts                          # process.exit(run(...)) — the mbe-scan bin entrypoint
├── run-cli.ts                      # Pure CLI core: parses argv, writes IO, returns exit code
├── scan-package.ts                 # scanPackage(dir) — orchestrates collectFiles + heuristics
├── collect-files.ts                # Walks a package dir, returns text SourceFile[]
├── rule-engine.ts                  # Shared regex-matching helpers used by heuristics
├── types.ts                        # Category, Severity, Verdict, Finding, ScanResult
└── heuristics/
    ├── prompt-injection.ts         # instruction-override phrasing, hidden unicode, base64
    ├── data-exfiltration.ts        # secret read + outbound call correlation
    └── malicious-commands.ts       # curl|sh, rm -rf, eval(), dynamic require/import
```

`cli.ts` / `run-cli.ts` are split so the CLI logic (`run`) is testable via
injected `CliIo` without actually spawning a process (`run-cli.test.ts`).

## Consumers

None yet — no app, service, or CI workflow invokes `mbe-scan` or imports
`@mbe/supply-chain-scanner` today. It exists as a standalone, package-manager-
agnostic pre-install gate; wiring it into a hook or CI job is future work.

## Gotchas

- It is a **static** analyzer only — never imports, requires, evaluates, or spawns scanned code. It will miss obfuscated or purely runtime-generated behavior; treat findings as one layer, not a guarantee
- `computeVerdict` derives from the single highest-severity finding: any `high` → `block`, else any `med` → `flag`, else `pass` — low-severity findings never affect the verdict on their own
- The CLI exits `1` on `block`, `2` on missing usage arg, `0` otherwise — safe to gate an install step on the exit code alone

## Commands

```bash
pnpm build        # Compile TypeScript
pnpm test         # Vitest unit tests
pnpm lint         # ESLint
pnpm typecheck    # TypeScript check
```
