import { Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { SPACING_SCALE, SPACING_TOKEN_NAMES } from "./token-catalog";
import { useLiveTokenValues } from "./use-live-tokens";
import styles from "./SpacingPage.module.css";

/**
 * Spacing token documentation.
 *
 * The 4px-based scale, each step visualised as a bar whose width is painted
 * directly from `var(--rialto-space-*)`, so the visual and the label always
 * agree. The label prints the *resolved* value read live from the cascade.
 */
export function SpacingPage() {
  const values = useLiveTokenValues(SPACING_TOKEN_NAMES);

  return (
    <ComponentPageLayout
      name="Spacing"
      description="A 4px-based spacing scale for padding, gaps, and layout rhythm. Each step is drawn at its real width; the value is read live from the active theme."
    >
      <Section title={SPACING_SCALE.label}>
        <Text variant="body" color="secondary">
          {SPACING_SCALE.description}
        </Text>
        <div className={styles.scale}>
          {SPACING_SCALE.tokens.map((token) => {
            const slug = token.name.replace("--rialto-", "");
            const value = values[token.name] ?? "";
            return (
              <div key={token.name} className={styles.step} data-testid="spacing-step">
                <div className={styles.track} aria-hidden="true">
                  <div className={`${styles.bar} ${styles[slug] ?? ""}`} />
                </div>
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

SpacingPage.displayName = "SpacingPage";
