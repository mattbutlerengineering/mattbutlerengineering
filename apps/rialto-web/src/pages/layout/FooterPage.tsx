import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataList,
  Footer,
  type FooterColumn,
  Select,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { label: "Components", href: "#" },
      { label: "Tokens", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "#" },
      { label: "GitHub", href: "#" },
      { label: "Figma Kit", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type FooterVariant = "minimal" | "rich";

function FooterPlayground() {
  const [variant, setVariant] = useState<FooterVariant>("minimal");
  const [showColumns, setShowColumns] = useState(true);
  const [showCopyright, setShowCopyright] = useState(true);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: 0, overflow: "hidden" }}>
        {variant === "minimal" ? (
          <Footer>
            <Text variant="caption" color="secondary" as="span">
              &copy; 2026 Rialto Design System
            </Text>
            <Stack direction="row" gap="md">
              <a
                href="/"
                style={{ fontSize: "var(--rialto-text-sm)", color: "var(--rialto-text-secondary)" }}
              >
                Privacy
              </a>
              <a
                href="/"
                style={{ fontSize: "var(--rialto-text-sm)", color: "var(--rialto-text-secondary)" }}
              >
                Terms
              </a>
            </Stack>
          </Footer>
        ) : (
          <Footer
            variant="rich"
            columns={showColumns ? DEMO_COLUMNS : undefined}
            copyright={showCopyright ? "\u00a9 2026 Rialto Design System" : undefined}
          />
        )}
      </Card>
      <div className={styles.row}>
        <Select
          label="Variant"
          value={variant}
          onChange={(v) => setVariant(v as FooterVariant)}
          options={[
            { value: "minimal", label: "minimal" },
            { value: "rich", label: "rich" },
          ]}
        />
        {variant === "rich" && (
          <>
            <Checkbox
              label="Show Columns"
              checked={showColumns}
              onCheckedChange={setShowColumns}
            />
            <Checkbox
              label="Show Copyright"
              checked={showCopyright}
              onCheckedChange={setShowCopyright}
            />
          </>
        )}
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function FooterPage() {
  return (
    <ComponentPageLayout
      name="Footer"
      description="Page footer in two variants. Minimal is a horizontal row for utility content. Rich is a centered column with logo, multi-column link groups, and a copyright line."
    >
      {/* ── Minimal Variant ───────────────────────────────────────────── */}
      <Section title="Minimal (default)">
        <Stack gap="sm">
          <div
            style={{
              border: "1px solid var(--rialto-border)",
              borderRadius: "var(--rialto-radius-soft)",
              overflow: "hidden",
            }}
          >
            <Footer>
              <Text variant="caption" color="secondary" as="span">
                &copy; 2026 Rialto Design System
              </Text>
              <Stack direction="row" gap="md">
                <a
                  href="/"
                  style={{
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-secondary)",
                  }}
                >
                  Privacy
                </a>
                <a
                  href="/"
                  style={{
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-secondary)",
                  }}
                >
                  Terms
                </a>
                <a
                  href="/"
                  style={{
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-secondary)",
                  }}
                >
                  Status
                </a>
              </Stack>
            </Footer>
          </div>
          <Text variant="caption" color="secondary">
            Horizontal flex row — pass any children for copyright, links, or keyboard hints.
          </Text>
        </Stack>
      </Section>

      {/* ── Rich Variant ──────────────────────────────────────────────── */}
      <Section title="Rich">
        <Stack gap="sm">
          <div
            style={{
              border: "1px solid var(--rialto-border)",
              borderRadius: "var(--rialto-radius-soft)",
              overflow: "hidden",
            }}
          >
            <Footer
              variant="rich"
              columns={DEMO_COLUMNS}
              copyright="&copy; 2026 Rialto Design System"
            />
          </div>
          <Text variant="caption" color="secondary">
            Centered column layout with a logo (defaults to &quot;Rialto&quot; wordmark), link groups, and
            copyright.
          </Text>
        </Stack>
      </Section>

      {/* ── Rich with Custom Logo ─────────────────────────────────────── */}
      <Section title="Rich with Custom Logo">
        <div
          style={{
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
            overflow: "hidden",
          }}
        >
          <Footer
            variant="rich"
            logo={
              <Text variant="display" color="primary" as="span">
                Acme
              </Text>
            }
            columns={DEMO_COLUMNS.slice(0, 2)}
            copyright="&copy; 2026 Acme Corp. All rights reserved."
          />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Page Layout Pattern
            </Text>
            <Text variant="caption" color="secondary">
              Footer sits at the bottom of the page. Use minimal for app shells and rich for
              marketing pages.
            </Text>
            <Stack direction="row" gap="sm" align="center" justify="end" wrap>
              <Button variant="ghost" size="sm">
                View minimal example
              </Button>
              <Button variant="primary" size="sm">
                View rich example
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <FooterPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"minimal" | "rich"',
              default: '"minimal"',
              description: "Layout variant. Minimal is a horizontal row; rich is a centered column.",
            },
            {
              name: "columns",
              type: "FooterColumn[]",
              description: "Multi-column link groups. Only rendered in the rich variant.",
            },
            {
              name: "copyright",
              type: "string",
              description: "Bottom copyright line. Only rendered in the rich variant.",
            },
            {
              name: "logo",
              type: "ReactNode",
              description:
                'Logo slot for the rich variant. Defaults to the "Rialto" accent wordmark.',
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Arbitrary content for the minimal variant.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<footer> landmark element" },
            {
              label: "Nav",
              value:
                'Rich variant wraps link columns in <nav aria-label="Footer links">',
            },
            {
              label: "Links",
              value: "Native <a> elements — keyboard accessible and correctly announced",
            },
            {
              label: "Logo",
              value:
                "Default logo is decorative text. Add aria-label to a custom logo if it is the only brand identifier",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

FooterPage.displayName = "FooterPage";
