import css from "../showcase.module.css";

const SURFACE_TOKENS = [
  { name: "--rialto-surface", label: "Surface" },
  { name: "--rialto-surface-elevated", label: "Elevated" },
  { name: "--rialto-surface-recessed", label: "Recessed" },
  { name: "--rialto-surface-matte", label: "Matte" },
  { name: "--rialto-surface-deep", label: "Deep" },
] as const;

const TEXT_TOKENS = [
  { name: "--rialto-text-primary", label: "Primary" },
  { name: "--rialto-text-secondary", label: "Secondary" },
  { name: "--rialto-text-tertiary", label: "Tertiary" },
] as const;

const ACCENT_TOKENS = [
  { name: "--rialto-accent", label: "Accent" },
  { name: "--rialto-accent-hover", label: "Accent Hover" },
  { name: "--rialto-accent-muted", label: "Accent Muted" },
] as const;

const SEMANTIC_TOKENS = [
  { name: "--rialto-error", label: "Error" },
  { name: "--rialto-error-muted", label: "Error Muted" },
  { name: "--rialto-warning", label: "Warning" },
  { name: "--rialto-warning-muted", label: "Warning Muted" },
  { name: "--rialto-success", label: "Success" },
  { name: "--rialto-success-muted", label: "Success Muted" },
] as const;

const SPACING = ["2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] as const;
const RADII = ["none", "sharp", "default", "soft", "round"] as const;

function ColorRow({ tokens }: { tokens: ReadonlyArray<{ name: string; label: string }> }) {
  return (
    <div className={css.row} style={{ marginBlockEnd: "var(--rialto-space-sm)" }}>
      {tokens.map((t) => (
        <div key={t.name} className={css.colorSwatch}>
          <div
            className={css.swatchCircle}
            style={{ background: `var(${t.name})` }}
          />
          <span className={css.swatchLabel}>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

export function TokensSection() {
  return (
    <>
      <div style={{ marginBlockEnd: "var(--rialto-space-xl)" }}>
        <h3 className={css.subsectionTitle}>Surfaces</h3>
        <ColorRow tokens={SURFACE_TOKENS} />
      </div>

      <div style={{ marginBlockEnd: "var(--rialto-space-xl)" }}>
        <h3 className={css.subsectionTitle}>Text Colors</h3>
        <ColorRow tokens={TEXT_TOKENS} />
      </div>

      <div style={{ marginBlockEnd: "var(--rialto-space-xl)" }}>
        <h3 className={css.subsectionTitle}>Accent</h3>
        <ColorRow tokens={ACCENT_TOKENS} />
      </div>

      <div style={{ marginBlockEnd: "var(--rialto-space-xl)" }}>
        <h3 className={css.subsectionTitle}>Semantic</h3>
        <ColorRow tokens={SEMANTIC_TOKENS} />
      </div>

      <div style={{ marginBlockEnd: "var(--rialto-space-xl)" }}>
        <h3 className={css.subsectionTitle}>Spacing Scale</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--rialto-space-xs)" }}>
          {SPACING.map((size) => (
            <div key={size} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: `var(--rialto-space-${size})`,
                  height: `var(--rialto-space-${size})`,
                  background: "var(--rialto-accent-muted)",
                  border: "1px solid var(--rialto-accent)",
                  borderRadius: "var(--rialto-radius-sharp)",
                }}
              />
              <span className={css.swatchLabel} style={{ marginBlockStart: 4 }}>
                {size}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className={css.subsectionTitle}>Border Radius</h3>
        <div style={{ display: "flex", gap: "var(--rialto-space-md)", alignItems: "center" }}>
          {RADII.map((r) => (
            <div key={r} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  background: "var(--rialto-surface-elevated)",
                  border: "1px solid var(--rialto-border)",
                  borderRadius: `var(--rialto-radius-${r})`,
                }}
              />
              <span className={css.swatchLabel} style={{ marginBlockStart: 4 }}>
                {r}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
