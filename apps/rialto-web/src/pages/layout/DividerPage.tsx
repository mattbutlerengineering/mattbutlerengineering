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
          <Text
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Left
          </Text>
          <Divider orientation="vertical" />
          <Text
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Center
          </Text>
          <Divider orientation="vertical" accent />
          <Text
            style={{
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Right
          </Text>
        </div>
      </Section>

      {/* ── Spacing ───────────────────────────────────────────────── */}
      <Section title="Spacing">
        <Stack gap="xs">
          <Text style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
            spacing=&quot;compact&quot;
          </Text>
          <Divider spacing="compact" />
          <Text style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
            spacing=&quot;default&quot; (default)
          </Text>
          <Divider spacing="default" />
          <Text style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
            spacing=&quot;spacious&quot;
          </Text>
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
            <Text
              style={{
                margin: "0 0 var(--rialto-space-sm)",
                fontSize: "var(--rialto-text-sm)",
                fontWeight: "var(--rialto-weight-medium)",
                color: "var(--rialto-text-primary)",
              }}
            >
              Session Configuration
            </Text>
            <Divider accent spacing="compact" />
            <Text
              style={{
                margin: "var(--rialto-space-sm) 0 0",
                fontSize: "var(--rialto-text-sm)",
                color: "var(--rialto-text-secondary)",
              }}
            >
              Tire compound: Soft (C5) &middot; Fuel load: 62 kg
            </Text>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Divider" />
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
