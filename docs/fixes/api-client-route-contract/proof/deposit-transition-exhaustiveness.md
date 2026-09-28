# Proof: a fourth `DepositTransition` member fails typecheck

Captured 2026-09-22 during Implement work item 6
(`docs/fixes/api-client-route-contract/breakdown.md`), on branch
`fix/api-client-route-contract` at commit `0a6ff414a`.

`deposits.transition(id, action)` composes `${BASE}/${id}/${action}` from a
union, so the three server routes behind it cannot be produced by the driver's
generic argument filler. They come from
`DEPOSIT_TRANSITION_ARGS: Readonly<Record<DepositTransition, readonly unknown[]>>`
in `tools/route-contract/src/client-inventory.ts`. **Vitest does not typecheck**,
so the claim "adding a fourth member fails the build" has to be run, not
asserted.

## Baseline — typecheck green

```
$ pnpm --dir tools/route-contract typecheck

> @mbe/route-contract@0.0.0 typecheck /…/tools/route-contract
> tsc --noEmit
```

## Scratch edit — widen the union, add no map entry

`packages/api-client/src/deposits.ts:14`

```diff
-export type DepositTransition = "capture" | "refund" | "forfeit";
+export type DepositTransition = "capture" | "refund" | "forfeit" | "chargeback";
```

```
$ pnpm --dir tools/route-contract typecheck

> @mbe/route-contract@0.0.0 typecheck /…/tools/route-contract
> tsc --noEmit

src/client-inventory.ts(69,14): error TS2741: Property 'chargeback' is missing in type '{ capture: string[]; refund: string[]; forfeit: string[]; }' but required in type 'Readonly<Record<DepositTransition, readonly unknown[]>>'.
 ELIFECYCLE  Command failed with exit code 2.
```

## Reverted

```
$ git status --porcelain packages/api-client/src/deposits.ts
(no output — clean)
```

## The durable half

The transcript above proves the gate once. `client-driver-completeness.test.ts`
keeps proving it on every CI run: the test
`"is exhaustive at compile time, which is where vitest cannot help"` carries a
`@ts-expect-error` over a deliberately-incomplete `Record<DepositTransition, …>`.
If the exhaustiveness check ever stopped being a compile error, the directive
would become unused and `tsc --noEmit` would fail on it
(`Unused '@ts-expect-error' directive`) — so the demonstration cannot rot into
prose.
