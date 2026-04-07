import { useNavigate } from "react-router-dom";
import { Card, Stat, Stack, Text } from "@mbe/rialto";
import { NAV_SECTIONS, COMPONENT_COUNT } from "../data/nav-sections";
import styles from "./OverviewPage.module.css";

const CATEGORY_COUNT = NAV_SECTIONS.length;
const TOKEN_COUNT = 80; // approximate token count for display

/**
 * Landing page for the Rialto design system showcase.
 *
 * Sections:
 * - Hero area with logo and tagline
 * - Stats row (component count, categories, tokens)
 * - Category preview cards linking to first component in each category
 * - Getting started section
 */
export function OverviewPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      {/* ── Hero ────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroLogo}>
          Ri<span className={styles.heroLogoAccent}>a</span>lto
        </div>
        <Stack gap="sm" align="center">
          <Text variant="display" color="primary" align="center" as="h1">
            Precision-crafted React components
          </Text>
          <Text variant="body" color="secondary" align="center">
            A design system with warm material surfaces, gold accents, and full WCAG AA
            accessibility. Built for production.
          </Text>
        </Stack>
      </section>

      {/* ── Stats ───────────────────────────────── */}
      <section className={styles.stats}>
        <Stat
          label="Components"
          value={String(COMPONENT_COUNT)}
          size="lg"
        />
        <div className={styles.statDivider} />
        <Stat
          label="Categories"
          value={String(CATEGORY_COUNT)}
          size="lg"
        />
        <div className={styles.statDivider} />
        <Stat
          label="Design Tokens"
          value={`${TOKEN_COUNT}+`}
          size="lg"
        />
      </section>

      {/* ── Category previews ───────────────────── */}
      <section className={styles.categories}>
        <Text variant="display" color="primary" as="h2">
          Browse by category
        </Text>
        <Text variant="body" color="secondary">
          Browse components by category in the sidebar, or click a category below to get started.
        </Text>

        <div className={styles.categoryGrid}>
          {NAV_SECTIONS.map((section) => {
            const firstItem = section.items[0];
            return (
              <Card
                key={section.label}
                variant="elevated"
                className={styles.categoryCard}
                onClick={() => firstItem && navigate(firstItem.path)}
                style={{ cursor: "pointer" }}
                role="button"
                tabIndex={0}
                aria-label={`Browse ${section.label} components`}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && firstItem) {
                    e.preventDefault();
                    navigate(firstItem.path);
                  }
                }}
              >
                <div className={styles.categoryCardContent}>
                  <div className={styles.categoryCardHeader}>
                    <Text variant="label" color="primary">
                      {section.label}
                    </Text>
                    <span className={styles.categoryCount}>{section.items.length}</span>
                  </div>
                  <ul className={styles.componentList}>
                    {section.items.slice(0, 4).map((item) => (
                      <li key={item.id} className={styles.componentListItem}>
                        <Text variant="detail" color="secondary">
                          {item.label}
                        </Text>
                      </li>
                    ))}
                    {section.items.length > 4 && (
                      <li className={styles.componentListItem}>
                        <Text variant="detail" color="tertiary">
                          +{section.items.length - 4} more
                        </Text>
                      </li>
                    )}
                  </ul>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Getting started ─────────────────────── */}
      <section className={styles.gettingStarted}>
        <Card variant="flat" className={styles.gettingStartedCard}>
          <Stack gap="md">
            <Text variant="display" color="primary" as="h2">
              Getting started
            </Text>
            <Text variant="body" color="secondary">
              Install the Rialto package and wrap your app with{" "}
              <code className={styles.code}>RialtoProvider</code>:
            </Text>
            <div className={styles.codeBlock}>
              <pre className={styles.pre}>
                <code>
                  {`import { RialtoProvider } from '@mbe/rialto';
import '@mbe/rialto/styles';

function App() {
  return (
    <RialtoProvider theme="system">
      {/* Your app */}
    </RialtoProvider>
  );
}`}
                </code>
              </pre>
            </div>
            <Text variant="body" color="secondary">
              Then use any component from the library — no additional configuration required.
            </Text>
          </Stack>
        </Card>
      </section>
    </div>
  );
}

OverviewPage.displayName = "OverviewPage";
