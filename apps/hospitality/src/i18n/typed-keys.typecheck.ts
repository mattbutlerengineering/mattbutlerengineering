/**
 * Compile-time contract, checked by `pnpm typecheck` (test files are excluded
 * from tsconfig, so this cannot live in a .test.ts). Never imported or run.
 */
import type { TFunction } from "i18next";

export function typedKeysContract(t: TFunction): string[] {
  return [
    t("shell.skipToMain"),
    // @ts-expect-error — a key missing from the en-US catalog is a type error
    t("no.such.key"),
  ];
}
