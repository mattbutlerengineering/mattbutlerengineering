import { Badge, Checkbox, DataList, Select, Stack, Text } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type BadgeVariant = "neutral" | "accent" | "success" | "error";
type BadgeSize = "sm" | "md";

function BadgePlayground() {
  const [variant, setVariant] = useState<BadgeVariant>("neutral");
  const [size, setSize] = useState<BadgeSize>("md");
  const [dot, setDot] = useState(false);

  return (
    <Stack gap="lg">
      <div style={{ padding: "var(--rialto-space-xl)", textAlign: "center" }}>
        <Badge variant={variant} size={size} dot={dot}>
          Badge
        </Badge>
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Variant"
          value={variant}
          onChange={(v) => setVariant(v as BadgeVariant)}
          options={[
            { value: "neutral", label: "neutral" },
            { value: "accent", label: "accent" },
            { value: "success", label: "success" },
            { value: "error", label: "error" },
          ]}
        />
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as BadgeSize)}
          options={[
            { value: "md", label: "md" },
            { value: "sm", label: "sm" },
          ]}
        />
        <Checkbox label="Status dot" checked={dot} onCheckedChange={setDot} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BadgePage() {
  return (
    <ComponentPageLayout
      name="Badge"
      description="Sharp 2px radius. Tight, precise, small. Gold reserved for active/selected state only. Status dots for live indicators."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.row}>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="accent">Active</Badge>
          <Badge variant="success">Ready</Badge>
          <Badge variant="error">Alert</Badge>
        </div>
      </Section>

      {/* ── With Status Dot ───────────────────────────────────────── */}
      <Section title="With Status Dot">
        <div className={styles.row}>
          <Badge variant="neutral" dot>
            Offline
          </Badge>
          <Badge variant="accent" dot>
            In session
          </Badge>
          <Badge variant="success" dot>
            Connected
          </Badge>
          <Badge variant="error" dot>
            Fault
          </Badge>
        </div>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.row}>
          <Badge>Medium (default)</Badge>
          <Badge size="sm">Small</Badge>
        </div>
        <div className={styles.row}>
          <Badge size="sm">v4.2.1</Badge>
          <Badge size="sm" variant="accent">
            PRO
          </Badge>
          <Badge size="sm" variant="success" dot>
            Live
          </Badge>
          <Badge size="sm" variant="error">
            3
          </Badge>
        </div>
      </Section>

      {/* ── In Context ────────────────────────────────────────────── */}
      <Section title="In Context">
        <div className={styles.row}>
          <span
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "var(--rialto-space-xs)",
            }}
          >
            Telemetry{" "}
            <Badge variant="success" dot>
              Live
            </Badge>
          </span>
          <span
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "var(--rialto-space-xs)",
            }}
          >
            Notifications{" "}
            <Badge variant="error" size="sm">
              12
            </Badge>
          </span>
          <Text variant="caption" color="secondary" as="span">
            Version{" "}
            <Badge size="sm" variant="neutral">
              4.2.1
            </Badge>
          </Text>
        </div>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <BadgePlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"neutral" | "accent" | "success" | "error"',
              default: '"neutral"',
              description: "Color variant of the badge.",
            },
            {
              name: "size",
              type: '"sm" | "md"',
              default: '"md"',
              description: "Size of the badge.",
            },
            {
              name: "dot",
              type: "boolean",
              default: "false",
              description: "Shows a status dot before the text.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Badge label content.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<span> — inline element" },
            { label: "Semantics", value: "No implicit role; wrap in aria-label if status dot carries meaning" },
            { label: "Color", value: "Color is supplemental — text content must convey meaning" },
            { label: "Contrast", value: "All variants meet WCAG AA 4.5:1 contrast ratio" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

BadgePage.displayName = "BadgePage";
