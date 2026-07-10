import { Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { COLOR_GROUPS, COLOR_TOKEN_NAMES } from "./token-catalog";
import { useLiveTokenValues } from "./use-live-tokens";
import styles from "./ColorPage.module.css";

/**
 * Color token documentation.
 *
 * A swatch grid grouped by semantic role (surfaces, text, borders, accent,
 * status, overlay). Each swatch paints its color straight from the token via
 * `var(--rialto-*)` and prints the *resolved* value read live from the active
 * theme — so both the visual and the label track the compiled stylesheet.
 */
export function ColorPage() {
  const values = useLiveTokenValues(COLOR_TOKEN_NAMES);

  return (
    <ComponentPageLayout
      name="Color"
      description="Semantic color tokens for surfaces, text, borders, accent, and status. Values are read live from the active theme — toggle the theme in the header to compare light and dark."
    >
      {COLOR_GROUPS.map((group) => (
        <Section key={group.label} title={group.label}>
          <Text variant="body" color="secondary">
            {group.description}
          </Text>
          <div className={styles.gallery}>
            {group.tokens.map((token) => {
              const slug = token.name.replace("--rialto-", "");
              const value = values[token.name] ?? "";
              return (
                <div key={token.name} className={styles.swatch}>
                  <div
                    className={`${styles.chip} ${styles[slug] ?? ""}`}
                    data-testid="color-swatch"
                    aria-hidden="true"
                  />
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

ColorPage.displayName = "ColorPage";
