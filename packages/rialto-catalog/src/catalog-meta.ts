/**
 * CatalogMeta — consumer-side mirror of the co-located catalog metadata type.
 *
 * The authoring source of truth is
 * `packages/rialto/src/components/catalog-meta.ts`, which each
 * `<Component>.catalog.ts` file uses with `satisfies CatalogMeta`. This file is
 * a structurally identical mirror so @mbe/rialto-catalog can type the generated
 * `generated-catalog.ts` without a rialto → rialto-catalog dependency cycle and
 * without depending on rialto's auto-generated package `exports` map. Keep the
 * two definitions in sync — they are intentionally tiny.
 */

export type CatalogCharLimits = Readonly<Record<string, number>>;
export type CatalogAliases = Readonly<Record<string, string>>;

export interface CatalogMeta {
  /** Component display name — must match the Rialto barrel export. */
  readonly name: string;
  /** Whether this component is offered to the AI for generation. Defaults to true. */
  readonly include?: boolean;
  /** Usage-oriented description telling the AI WHEN to use the component. */
  readonly description: string;
  /** Named slot keys — use `["default"]` for a children slot. */
  readonly slots?: readonly string[];
  /** Per-prop character limits folded into the generated Zod schema. */
  readonly charLimits?: CatalogCharLimits;
  /** Declared AI prop aliases handled by a hand-written registry adapter. */
  readonly aliases?: CatalogAliases;
}
