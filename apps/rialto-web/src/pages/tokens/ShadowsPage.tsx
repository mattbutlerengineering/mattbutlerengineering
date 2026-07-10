import { Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { SHADOW_GROUPS, SHADOW_TOKEN_NAMES } from "./token-catalog";
import { useLiveTokenValues } from "./use-live-tokens";
import styles from "./ShadowsPage.module.css";

/**
 * Shadow token documentation.
 *
 * Elevation, interaction/depth, and warm-glow shadow tiers, each carried on an
 * elevated surface sample painted with `var(--rialto-shadow-*)`. The shadow set
 * has dedicated dark-theme values, so every sample re-themes automatically —
 * toggle the theme to compare. Each label prints the *resolved* value read live
 * from the active theme.
 */
export function ShadowsPage() {
  const values = useLiveTokenValues(SHADOW_TOKEN_NAMES);

  return (
    <ComponentPageLayout
      name="Shadows"
      description="Elevation, depth, and warm-glow shadow tiers on surface samples. The shadow scale is theme-aware — toggle the theme in the header to compare light and dark."
    >
      {SHADOW_GROUPS.map((group) => (
        <Section key={group.label} title={group.label}>
          <Text variant="body" color="secondary">
            {group.description}
          </Text>
          <div className={styles.gallery}>
            {group.tokens.map((token) => {
              const slug = token.name.replace("--rialto-", "");
              const value = values[token.name] ?? "";
              return (
                <div key={token.name} className={styles.example} data-testid="shadow-sample">
                  <div className={`${styles.sample} ${styles[slug] ?? ""}`} aria-hidden="true" />
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

ShadowsPage.displayName = "ShadowsPage";
