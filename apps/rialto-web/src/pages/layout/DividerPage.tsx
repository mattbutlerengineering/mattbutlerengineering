import { DataList, Divider, Stack } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DividerPage() {
  return (
    <ComponentPageLayout
      name="Divider"
      description="Machined edge gradient separators. The gradient fades at both ends like a milled groove catching light. Optional centered label and gold accent variant."
    >
      {/* ── Horizontal ────────────────────────────────────────────── */}
      <Section title="Horizontal">
        <Stack gap="md">
          <Divider />
          <Divider label="Section" />
          <Divider accent />
          <Divider accent label="Telemetry" />
        </Stack>
      </Section>

      {/* ── Vertical ──────────────────────────────────────────────── */}
      <Section title="Vertical">
        <div className={styles.row} style={{ height: 60, alignItems: "stretch" }}>
          <span
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Left
          </span>
          <Divider orientation="vertical" />
          <span
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Center
          </span>
          <Divider orientation="vertical" accent />
          <span
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Right
          </span>
        </div>
      </Section>

      {/* ── Spacing ───────────────────────────────────────────────── */}
      <Section title="Spacing">
        <Stack gap="xs">
          <span style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
            spacing=&quot;compact&quot;
          </span>
          <Divider spacing="compact" />
          <span style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
            spacing=&quot;default&quot; (default)
          </span>
          <Divider spacing="default" />
          <span style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
            spacing=&quot;spacious&quot;
          </span>
          <Divider spacing="spacious" />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <div
            style={{
              padding: "var(--rialto-space-md)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
            }}
          >
            <p
              style={{
                margin: "0 0 var(--rialto-space-sm)",
                fontSize: "var(--rialto-text-sm)",
                fontWeight: "var(--rialto-weight-medium)",
                color: "var(--rialto-text-primary)",
              }}
            >
              Session Configuration
            </p>
            <Divider accent spacing="compact" />
            <p
              style={{
                margin: "var(--rialto-space-sm) 0 0",
                fontSize: "var(--rialto-text-sm)",
                color: "var(--rialto-text-secondary)",
              }}
            >
              Tire compound: Soft (C5) &middot; Fuel load: 62 kg
            </p>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "orientation",
              type: '"horizontal" | "vertical"',
              default: '"horizontal"',
              description: "Direction of the divider.",
            },
            {
              name: "label",
              type: "string",
              description: "Optional centered text label.",
            },
            {
              name: "accent",
              type: "boolean",
              default: "false",
              description: "Gold accent color variant.",
            },
            {
              name: "spacing",
              type: '"compact" | "default" | "spacious"',
              default: '"default"',
              description: "Margin spacing above and below.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Element",
              value: "<hr> element for horizontal, <div> with role=separator for vertical",
            },
            { label: "Label", value: "Rendered as visible text — not screen reader only" },
            {
              label: "Color",
              value: "Color uses CSS gradients — no meaning conveyed by color alone",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

DividerPage.displayName = "DividerPage";
