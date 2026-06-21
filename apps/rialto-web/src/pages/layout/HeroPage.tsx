import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataList,
  Hero,
  Input,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function HeroPlayground() {
  const [showEyebrow, setShowEyebrow] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [showActions, setShowActions] = useState(true);
  const [showDivider, setShowDivider] = useState(true);

  return (
    <Stack gap="lg">
      <div
        style={{
          border: "1px solid var(--rialto-border)",
          borderRadius: "var(--rialto-radius-soft)",
          overflow: "hidden",
        }}
      >
        <Hero
          eyebrow={showEyebrow ? "Design System" : undefined}
          title={
            <>
              Precision meets <Text className="accent">warmth</Text>
            </>
          }
          subtitle={showSubtitle ? "A component library for premium digital products." : undefined}
          actions={
            showActions ? (
              <>
                <Button variant="primary">Get started</Button>
                <Button variant="secondary">Learn more</Button>
              </>
            ) : undefined
          }
          showDivider={showDivider}
          minHeight="320px"
        />
      </div>
      <div className={styles.row}>
        <Checkbox label="Eyebrow" checked={showEyebrow} onCheckedChange={setShowEyebrow} />
        <Checkbox label="Subtitle" checked={showSubtitle} onCheckedChange={setShowSubtitle} />
        <Checkbox label="Actions" checked={showActions} onCheckedChange={setShowActions} />
        <Checkbox label="Divider" checked={showDivider} onCheckedChange={setShowDivider} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HeroPage() {
  return (
    <ComponentPageLayout
      name="Hero"
      description="Full-width marketing splash section with an animated fade-up entrance. Supports eyebrow label, title with accent spans, subtitle, gold divider, and a CTA actions slot."
    >
      {/* ── Full Hero ─────────────────────────────────────────────────── */}
      <Section title="Full Composition">
        <Stack gap="sm">
          <div
            style={{
              border: "1px solid var(--rialto-border)",
              borderRadius: "var(--rialto-radius-soft)",
              overflow: "hidden",
            }}
          >
            <Hero
              eyebrow="Design System"
              title={
                <>
                  Precision meets <Text className="accent">warmth</Text>
                </>
              }
              subtitle="A component library for premium digital products built to last."
              actions={
                <>
                  <Button variant="primary">Get started</Button>
                  <Button variant="secondary">View components</Button>
                </>
              }
              minHeight="360px"
            />
          </div>
          <Text variant="caption" color="secondary">
            Wrap text in{" "}
            <code style={{ fontFamily: "var(--rialto-font-mono)" }}>
              {'<span className="accent">'}
            </code>{" "}
            inside the title prop to apply the gold accent color.
          </Text>
        </Stack>
      </Section>

      {/* ── Title Only ────────────────────────────────────────────────── */}
      <Section title="Minimal (Title Only)">
        <div
          style={{
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
            overflow: "hidden",
          }}
        >
          <Hero title="Clean and focused" showDivider={false} minHeight="240px" />
        </div>
      </Section>

      {/* ── With Actions Only ────────────────────────────────────────── */}
      <Section title="With Actions">
        <div
          style={{
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
            overflow: "hidden",
          }}
        >
          <Hero
            eyebrow="v2.0 Released"
            title={
              <>
                Something <Text className="accent">new</Text> is here
              </>
            }
            actions={<Button variant="primary">Read the announcement</Button>}
            minHeight="240px"
          />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Landing Page Pattern
            </Text>
            <Text variant="caption" color="secondary">
              Hero sits at the top of a marketing page, followed by feature sections.
            </Text>
            <Stack gap="xs">
              <Input label="Eyebrow text" defaultValue="Design System" />
              <Input label="Title" defaultValue="Precision meets warmth" />
              <Input label="Subtitle" defaultValue="A component library for premium products." />
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <HeroPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Hero" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<section> landmark element" },
            {
              label: "Heading",
              value: "<h1> for the title — ensure it is the first h1 on the page",
            },
            {
              label: "Motion",
              value: "Fade-up entrance animation respects prefers-reduced-motion",
            },
            {
              label: "Accent span",
              value:
                'The <span className="accent"> is decorative only — no ARIA impact on screen readers',
            },
            {
              label: "aria-label",
              value: "Pass aria-label to the Hero for custom landmark labeling",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

HeroPage.displayName = "HeroPage";
