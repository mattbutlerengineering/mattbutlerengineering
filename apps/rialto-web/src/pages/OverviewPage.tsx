import { useNavigate } from "react-router";
import { Button, Card, Heading, Hero, Stack, Stat, Text } from "@mattbutlerengineering/rialto";
import manifest from "@mattbutlerengineering/rialto/manifest";
import { NAV_SECTIONS } from "../data/nav-sections.js";
import styles from "./OverviewPage.module.css";

// Counts are derived from generated/build-time sources so the stat row never
// drifts from the shipped library:
// - components  → the compiled rialto manifest
// - categories  → the nav registry (itself derived from the page registry)
// - tokens      → __RIALTO_TOKEN_COUNT__, counted from the shipped stylesheet
//                 at build time (see token-count.config.ts)
const COMPONENT_COUNT = manifest.components.length;
const CATEGORY_COUNT = NAV_SECTIONS.length;
const FIRST_COMPONENT_PATH = NAV_SECTIONS[0]?.items[0]?.path ?? "/";

/**
 * Landing page for the Rialto design system showcase.
 *
 * Sections:
 * - Hero (Rialto Hero primitive) with eyebrow, headline, and conversion CTAs
 * - Stats row driven by the manifest, nav registry, and build-time token count
 * - Category preview cards linking to the first component in each category
 * - Getting started section with the install snippet
 */
export function OverviewPage() {
  const navigate = useNavigate();

  const scrollToGetStarted = () => {
    document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className={styles.page}>
      {/* ── Hero ────────────────────────────────── */}
      <Hero
        eyebrow="Rialto Design System"
        minHeight="56vh"
        title={
          <>
            Precision-crafted React{" "}
            {/* eslint-disable-next-line mbe-local/prefer-rialto-components -- Hero's documented accent API requires a <span className="accent"> styling hook, not a typography component */}
            <span className="accent">components</span>
          </>
        }
        subtitle="A design system with warm material surfaces, gold accents, and full WCAG AA accessibility. Built for production."
        actions={
          <>
            <Button variant="primary" onClick={scrollToGetStarted}>
              Get started
            </Button>
            <Button variant="secondary" onClick={() => navigate(FIRST_COMPONENT_PATH)}>
              Browse components
            </Button>
          </>
        }
      />

      {/* ── Stats ───────────────────────────────── */}
      <section className={styles.stats}>
        <Stat label="Components" value={String(COMPONENT_COUNT)} size="lg" />
        <div className={styles.statDivider} />
        <Stat label="Categories" value={String(CATEGORY_COUNT)} size="lg" />
        <div className={styles.statDivider} />
        <Stat label="Design Tokens" value={String(__RIALTO_TOKEN_COUNT__)} size="lg" />
      </section>

      {/* ── Category previews ───────────────────── */}
      <section className={styles.categories}>
        <Heading level={2} color="primary">
          Browse by category
        </Heading>
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
                    <Text as="span" className={styles.categoryCount} aria-hidden="true">
                      {section.items.length}
                    </Text>
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
      <section id="get-started" className={styles.gettingStarted}>
        <Card variant="flat" className={styles.gettingStartedCard}>
          <Stack gap="md">
            <Heading level={2} color="primary">
              Getting started
            </Heading>
            <Text variant="body" color="secondary">
              Install the Rialto package and wrap your app with{" "}
              <code className={styles.code}>RialtoProvider</code>:
            </Text>
            <div className={styles.codeBlock}>
              <pre className={styles.pre}>
                <code>
                  {`import { RialtoProvider } from '@mattbutlerengineering/rialto';
import '@mattbutlerengineering/rialto/styles';

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
