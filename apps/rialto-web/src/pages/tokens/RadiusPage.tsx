import { Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { RADIUS_SCALE, RADIUS_TOKEN_NAMES } from "./token-catalog";
import { useLiveTokenValues } from "./use-live-tokens";
import styles from "./RadiusPage.module.css";

/**
 * Radius token documentation.
 *
 * The corner-rounding scale, each step shown on a representative shape whose
 * `border-radius` is painted directly from `var(--rialto-radius-*)`. The label
 * prints the *resolved* value read live from the cascade.
 */
export function RadiusPage() {
  const values = useLiveTokenValues(RADIUS_TOKEN_NAMES);

  return (
    <ComponentPageLayout
      name="Radius"
      description="Corner rounding by hierarchy, from square edges to fully round. Each shape is drawn at its real radius; the value is read live from the active theme."
    >
      <Section title={RADIUS_SCALE.label}>
        <Text variant="body" color="secondary">
          {RADIUS_SCALE.description}
        </Text>
        <div className={styles.gallery}>
          {RADIUS_SCALE.tokens.map((token) => {
            const slug = token.name.replace("--rialto-", "");
            const value = values[token.name] ?? "";
            return (
              <div key={token.name} className={styles.example} data-testid="radius-shape">
                <div className={`${styles.shape} ${styles[slug] ?? ""}`} aria-hidden="true" />
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
    </ComponentPageLayout>
  );
}

RadiusPage.displayName = "RadiusPage";
