import { Badge, Button, Card, Footer, Hero, Kbd, PageHeader } from "@mbe/rialto";
import styles from "./LayoutDemo.module.css";

/* ── Demo data ───────────────────────────────── */

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Components", href: "#components" },
      { label: "Tokens", href: "#tokens" },
      { label: "Changelog", href: "#changelog" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#docs" },
      { label: "Figma Kit", href: "#figma" },
      { label: "GitHub", href: "#github" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Discord", href: "#discord" },
      { label: "Contributing", href: "#contributing" },
      { label: "License", href: "#license" },
    ],
  },
];

/* ── Page ─────────────────────────────────────── */

export function LayoutDemo() {
  return (
    <div className={styles.page}>
      {/* ── PageHeader ──────────────────────────── */}
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/rialto/" }, { label: "Layouts" }]}
        title="Layout Components"
        meta={<Badge variant="accent">New</Badge>}
        actions={<Button size="sm">View source</Button>}
      />

      {/* ── Hero ────────────────────────────────── */}
      <Hero
        eyebrow="Design System"
        title={
          <>
            Build pages with <span style={{ color: "var(--rialto-accent)" }}>precision</span>
          </>
        }
        subtitle="Footer, Hero, and PageHeader — the scaffolding toolkit for complete page layouts. Composable, responsive, and dark-mode aware."
        actions={
          <>
            <Button variant="primary">Get started</Button>
            <Button variant="secondary">Documentation</Button>
          </>
        }
        minHeight="60vh"
      />

      {/* ── Component cards ─────────────────────── */}
      <div className={styles.content}>
        <h2 className={styles.sectionTitle}>Components</h2>
        <p className={styles.sectionDesc}>
          Three layout primitives that compose together for complete page scaffolding. Each uses
          design tokens and logical properties for automatic dark mode and RTL support.
        </p>

        <div className={styles.cardGrid}>
          <Card>
            <div style={{ padding: "var(--rialto-space-lg)" }}>
              <p className={styles.cardLabel}>PageHeader</p>
              <p className={styles.cardBody}>
                Dark header band with breadcrumbs, title, and action buttons. Uses{" "}
                <code>darkSurface</code> token override so child components adapt automatically.
              </p>
            </div>
          </Card>
          <Card>
            <div style={{ padding: "var(--rialto-space-lg)" }}>
              <p className={styles.cardLabel}>Hero</p>
              <p className={styles.cardBody}>
                Full-viewport centered splash with eyebrow, title, subtitle, and CTA actions.
                Entrance animation respects reduced-motion preferences.
              </p>
            </div>
          </Card>
          <Card>
            <div style={{ padding: "var(--rialto-space-lg)" }}>
              <p className={styles.cardLabel}>Footer</p>
              <p className={styles.cardBody}>
                Two variants — <code>minimal</code> for utility bars and <code>rich</code> for
                marketing footers with multi-column link groups.
              </p>
            </div>
          </Card>
        </div>

        {/* ── Minimal footer demo ─────────────── */}
        <hr className={styles.divider} />
        <h2 className={styles.sectionTitle}>Minimal Footer</h2>
        <p className={styles.sectionDesc}>
          A simple horizontal bar for utility links, keyboard hints, and copyright text.
        </p>

        <div className={styles.minimalFooterDemo}>
          <Footer>
            <span className={styles.footerText}>&copy; 2026 Rialto Design System</span>
            <span
              style={{
                display: "flex",
                gap: "var(--rialto-space-sm)",
                alignItems: "center",
              }}
            >
              <a href="#privacy" className={styles.footerLink}>
                Privacy
              </a>
              <a href="#terms" className={styles.footerLink}>
                Terms
              </a>
              <Kbd>?</Kbd>
            </span>
          </Footer>
        </div>
      </div>

      {/* ── Rich footer ─────────────────────────── */}
      <Footer
        variant="rich"
        columns={footerColumns}
        copyright="&copy; 2026 Rialto Design System. Crafted with precision."
      />
    </div>
  );
}
