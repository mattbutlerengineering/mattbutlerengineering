import { Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { ELEVATION_LEVELS, SURFACE_LEVELS, SURFACE_TOKEN_NAMES } from "./token-catalog";
import { useLiveTokenValues } from "./use-live-tokens";
import styles from "./SurfacesPage.module.css";

const SURFACE_SECTIONS = [SURFACE_LEVELS, ELEVATION_LEVELS];

/**
 * Surfaces & elevation token documentation.
 *
 * Surface levels are shown as composed panels painted from `var(--rialto-surface-*)`,
 * and elevation tiers as raised panels carrying `var(--rialto-shadow-*)`. Every
 * label prints the *resolved* value read live from the active theme, so the docs
 * track the compiled stylesheet and re-theme automatically.
 */
export function SurfacesPage() {
  const values = useLiveTokenValues(SURFACE_TOKEN_NAMES);

  return (
    <ComponentPageLayout
      name="Surfaces"
      description="Background layers and elevation tiers, shown as composed panels. Values are read live from the active theme — toggle the theme in the header to compare light and dark."
    >
      {SURFACE_SECTIONS.map((group) => (
        <Section key={group.label} title={group.label}>
          <Text variant="body" color="secondary">
            {group.description}
          </Text>
          <div className={styles.gallery}>
            {group.tokens.map((token) => {
              const slug = token.name.replace("--rialto-", "");
              const value = values[token.name] ?? "";
              return (
                <div key={token.name} className={styles.example} data-testid="surface-example">
                  <div className={`${styles.panel} ${styles[slug] ?? ""}`} aria-hidden="true" />
                  <div className={styles.meta}>
                    <Text variant="caption" mono className={styles.name}>
                      {token.name}
                    </Text>
                    <Text variant="caption" mono color="secondary" className={styles.value}>
                      {value || "—"}
                    </Text>
                    <Text variant="detail" color="tertiary" className={styles.usage}>
                      {token.usage}
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </ComponentPageLayout>
  );
}

SurfacesPage.displayName = "SurfacesPage";
