/**
 * CatalogMeta — co-located catalog metadata for a Rialto component.
 *
 * This is the single source of truth that the @mbe/rialto-catalog generator
 * reads to emit Zod schemas, AI descriptions, and registry prop-mappings in one
 * pass. Each curated component owns a `<Component>.catalog.ts` file next to its
 * source that exports a value `satisfies CatalogMeta`.
 *
 * This type is intentionally runtime-free (pure type, no Zod, no imports) so
 * adding it to a component never pulls catalog tooling into the design system
 * bundle and never creates a rialto → rialto-catalog dependency cycle.
 *
 * NOT re-exported from the public component barrel — it is internal metadata,
 * not part of the design-system API surface.
 */

/** Per-prop character ceiling enforced as `z.string().max(n)` in the generated schema. */
export type CatalogCharLimits = Readonly<Record<string, number>>;

/**
 * AI-facing prop name → actual Rialto prop name. Declares the irregular
 * rename adapters that used to live inline in registry.tsx (e.g. EmptyState
 * `title` → `heading`). The renderer is still hand-written, but the alias is
 * declared here so the generator/parity check can guard it.
 */
export type CatalogAliases = Readonly<Record<string, string>>;

export interface CatalogMeta {
  /** Component display name — must match the Rialto barrel export. */
  readonly name: string;
  /**
   * Whether this component is offered to the AI for generation. Curated
   * components with `include: false` stay in the metadata (so the generator
   * still sees them) but are excluded from the catalog the AI consumes.
   * Defaults to `true` when omitted.
   */
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
