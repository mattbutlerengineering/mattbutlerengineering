import { getIconsByCategory, iconCategories, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { ICON_CATEGORY_GUIDANCE } from "./token-catalog";
import styles from "./IconVocabularyPage.module.css";

/**
 * Icon vocabulary documentation.
 *
 * Icons are a design-system vocabulary rather than CSS custom properties, so the
 * page reads the live set from rialto's `iconVocabulary` (via `getIconsByCategory`)
 * — a new icon added to the design system appears here automatically. Each entry
 * shows the semantic concept (the `getIcon` lookup key) and its human label;
 * every category carries usage guidance so intent, not just appearance, is clear.
 */
export function IconVocabularyPage() {
  return (
    <ComponentPageLayout
      name="Icon Vocabulary"
      description="The Rialto icon set, grouped by semantic category. Reference icons by their concept name — the stable key that maps to the underlying glyph — not the glyph itself."
    >
      {iconCategories.map((category) => {
        const guidance = ICON_CATEGORY_GUIDANCE[category];
        const icons = getIconsByCategory(category);
        if (!guidance || icons.length === 0) return null;
        return (
          <Section key={category} title={guidance.label}>
            <Text variant="body" color="secondary">
              {guidance.description}
            </Text>
            <div className={styles.gallery}>
              {icons.map((entry) => {
                const Glyph = entry.icon;
                return (
                  <div key={entry.concept} className={styles.entry} data-testid="icon-entry">
                    <div className={styles.glyph} aria-hidden="true">
                      <Glyph aria-hidden="true" />
                    </div>
                    <div className={styles.meta}>
                      <Text variant="caption" mono className={styles.concept}>
                        {entry.concept}
                      </Text>
                      <Text variant="detail" color="secondary" className={styles.label}>
                        {entry.label}
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

IconVocabularyPage.displayName = "IconVocabularyPage";
