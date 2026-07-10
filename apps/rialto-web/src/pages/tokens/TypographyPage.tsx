import { Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { TYPOGRAPHY_GROUPS, TYPOGRAPHY_TOKEN_NAMES } from "./token-catalog";
import { useLiveTokenValues } from "./use-live-tokens";
import styles from "./TypographyPage.module.css";

/** Specimen copy chosen to best reveal each group's property. */
const GROUP_SAMPLES: Record<string, string> = {
  "Line heights":
    "Rialto favors warmth over coldness and material honesty over flat abstraction, line after wrapping line.",
  "Letter spacing": "Rialto Design System",
};
const DEFAULT_SAMPLE = "The quick brown fox jumps";

/**
 * Typography token documentation.
 *
 * Type-scale, family, weight, leading, and tracking specimens. Each specimen is
 * styled directly with `var(--rialto-*)` so it renders at the real value, and is
 * labeled with the *resolved* value read live from the cascade — never a
 * hardcoded literal.
 */
export function TypographyPage() {
  const values = useLiveTokenValues(TYPOGRAPHY_TOKEN_NAMES);

  return (
    <ComponentPageLayout
      name="Typography"
      description="Font families, the type scale, weights, line heights, and letter spacing. Each specimen renders at its real value; the label is read live from the active theme."
    >
      {TYPOGRAPHY_GROUPS.map((group) => {
        const sample = GROUP_SAMPLES[group.label] ?? DEFAULT_SAMPLE;
        return (
          <Section key={group.label} title={group.label}>
            <Text variant="body" color="secondary">
              {group.description}
            </Text>
            <div className={styles.specimens}>
              {group.tokens.map((token) => {
                const slug = token.name.replace("--rialto-", "");
                const value = values[token.name] ?? "";
                return (
                  <div key={token.name} className={styles.specimen} data-testid="type-specimen">
                    <div className={`${styles.preview} ${styles[slug] ?? ""}`}>{sample}</div>
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
        );
      })}
    </ComponentPageLayout>
  );
}

TypographyPage.displayName = "TypographyPage";
