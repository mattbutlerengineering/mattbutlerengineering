import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataList,
  type BreadcrumbItem,
  PageHeader,
  Stack,
  Text,
} from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const BREADCRUMBS_SHORT: BreadcrumbItem[] = [
  { label: "Home", href: "#" },
  { label: "Settings" },
];

const BREADCRUMBS_LONG: BreadcrumbItem[] = [
  { label: "Home", href: "#" },
  { label: "Sessions", href: "#" },
  { label: "Monza 2026", href: "#" },
  { label: "Lap Analysis" },
];

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function PageHeaderPlayground() {
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(true);
  const [showActions, setShowActions] = useState(true);
  const [showMeta, setShowMeta] = useState(true);
  const [showChildren, setShowChildren] = useState(false);

  return (
    <Stack gap="lg">
      <div
        style={{
          border: "1px solid var(--rialto-border)",
          borderRadius: "var(--rialto-radius-soft)",
          overflow: "hidden",
        }}
      >
        <PageHeader
          title="Account Settings"
          breadcrumbs={showBreadcrumbs ? BREADCRUMBS_SHORT : undefined}
          actions={
            showActions ? (
              <>
                <Button variant="ghost" size="sm">
                  Discard
                </Button>
                <Button variant="primary" size="sm">
                  Save Changes
                </Button>
              </>
            ) : undefined
          }
          meta={
            showMeta ? (
              <Badge variant="success">Active</Badge>
            ) : undefined
          }
        >
          {showChildren ? (
            <Text variant="caption" color="secondary">
              Extra content area below the title row — use for tab bars or sub-navigation.
            </Text>
          ) : undefined}
        </PageHeader>
      </div>
      <div className={styles.row}>
        <Checkbox
          label="Breadcrumbs"
          checked={showBreadcrumbs}
          onCheckedChange={setShowBreadcrumbs}
        />
        <Checkbox
          label="Actions"
          checked={showActions}
          onCheckedChange={setShowActions}
        />
        <Checkbox
          label="Meta"
          checked={showMeta}
          onCheckedChange={setShowMeta}
        />
        <Checkbox
          label="Children"
          checked={showChildren}
          onCheckedChange={setShowChildren}
        />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PageHeaderPage() {
  return (
    <ComponentPageLayout
      name="PageHeader"
      description="Dark header band with breadcrumbs, title, meta badges, and action buttons. Uses darkSurface token override so child components adapt automatically."
    >
      {/* ── Basic Usage ─────────────────────────────────────────────── */}
      <Section title="Basic Usage">
        <div
          style={{
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
            overflow: "hidden",
          }}
        >
          <PageHeader
            title="Account Settings"
            breadcrumbs={BREADCRUMBS_SHORT}
          />
        </div>
      </Section>

      {/* ── With Actions ─────────────────────────────────────────────── */}
      <Section title="With Actions">
        <div
          style={{
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
            overflow: "hidden",
          }}
        >
          <PageHeader
            title="Session Configuration"
            breadcrumbs={BREADCRUMBS_SHORT}
            actions={
              <>
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button variant="primary" size="sm">
                  Save
                </Button>
              </>
            }
          />
        </div>
      </Section>

      {/* ── With Meta ────────────────────────────────────────────────── */}
      <Section title="With Meta Badges">
        <Stack gap="sm">
          <div
            style={{
              border: "1px solid var(--rialto-border)",
              borderRadius: "var(--rialto-radius-soft)",
              overflow: "hidden",
            }}
          >
            <PageHeader
              title="Monza 2026 — Lap Analysis"
              breadcrumbs={BREADCRUMBS_LONG}
              meta={
                <Stack direction="row" gap="xs">
                  <Badge variant="accent">Qualifying</Badge>
                  <Badge variant="success">Completed</Badge>
                </Stack>
              }
              actions={
                <Button variant="secondary" size="sm">
                  Export
                </Button>
              }
            />
          </div>
          <Text variant="caption" color="secondary">
            The meta slot sits beside the title. Badges automatically adapt to the dark surface.
          </Text>
        </Stack>
      </Section>

      {/* ── Long Breadcrumb Trail ─────────────────────────────────────── */}
      <Section title="Long Breadcrumb Trail">
        <div
          style={{
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
            overflow: "hidden",
          }}
        >
          <PageHeader
            title="Lap Analysis"
            breadcrumbs={BREADCRUMBS_LONG}
          />
        </div>
      </Section>

      {/* ── With Extra Content ────────────────────────────────────────── */}
      <Section title="With Children (Extra Content)">
        <div
          style={{
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
            overflow: "hidden",
          }}
        >
          <PageHeader
            title="Driver Overview"
            breadcrumbs={[{ label: "Sessions", href: "#" }, { label: "Driver Overview" }]}
            actions={<Button variant="secondary" size="sm">Export CSV</Button>}
          >
            <Text variant="caption" color="secondary">
              Showing data for the last 5 sessions across all circuits.
            </Text>
          </PageHeader>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Standard Page Pattern
            </Text>
            <Text variant="caption" color="secondary">
              PageHeader sits at the top of an app page, directly below the Navbar. It provides
              navigation context, the page title, status indicators, and page-level actions.
            </Text>
            <div className={styles.row} style={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm">
                View example
              </Button>
              <Button variant="primary" size="sm">
                Open in demo
              </Button>
            </div>
          </Stack>
        </Card>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <PageHeaderPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "title",
              type: "string",
              description: "Page title rendered as h1.",
            },
            {
              name: "breadcrumbs",
              type: "BreadcrumbItem[]",
              description: "Breadcrumb trail rendered above the title.",
            },
            {
              name: "actions",
              type: "ReactNode",
              description: "Right-aligned action buttons. Hidden on narrow screens.",
            },
            {
              name: "meta",
              type: "ReactNode",
              description: "Badges or avatars displayed beside the title.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Extra content rendered below the title row (e.g. tab bar).",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<header> landmark element" },
            {
              label: "Heading",
              value: "<h1> — ensure this is the primary heading for the current page",
            },
            {
              label: "Dark Surface",
              value:
                "darkSurface CSS variable override — child Badges, Buttons, and Text adapt automatically",
            },
            {
              label: "Breadcrumb",
              value:
                "Composes Breadcrumb component with <nav aria-label='Breadcrumb'> and aria-current",
            },
            {
              label: "Actions",
              value: "Right-aligned slot — visually hidden on narrow screens via CSS",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

PageHeaderPage.displayName = "PageHeaderPage";
