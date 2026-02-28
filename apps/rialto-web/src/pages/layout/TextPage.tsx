import { DataList, Select, Stack, Text } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type TextVariant = "display" | "body" | "caption" | "detail" | "label";
type TextColor = "primary" | "secondary" | "tertiary" | "accent" | "success" | "error";

export function TextPage() {
  const [variant, setVariant] = useState<TextVariant>("body");
  const [color, setColor] = useState<TextColor>("primary");

  return (
    <ComponentPageLayout
      name="Text"
      description="Typography primitive with named presets. Each variant maps to a combination of size, weight, color, and tracking from the type scale. Override any default with individual props."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <Stack gap="sm">
          <Text variant="display">1:24.892</Text>
          <Text variant="body">
            The default body text. Regular weight, primary color, relaxed line height for comfortable
            reading.
          </Text>
          <Text variant="caption">
            Caption text — smaller, secondary color. Ideal for supplementary information beneath a
            heading.
          </Text>
          <Text variant="detail">
            Detail text — the smallest size, tertiary color. Timestamps, metadata, footnotes.
          </Text>
          <Text variant="label">Telemetry active</Text>
        </Stack>
      </Section>

      {/* ── Colors ────────────────────────────────────────────────── */}
      <Section title="Colors">
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          {(["primary", "secondary", "tertiary", "accent", "success", "error"] as TextColor[]).map(
            (c) => (
              <Text key={c} variant="caption" color={c} as="span">
                {c}
              </Text>
            )
          )}
        </div>
      </Section>

      {/* ── Mono ──────────────────────────────────────────────────── */}
      <Section title="Monospace">
        <div className={styles.row}>
          <Text variant="caption" mono as="span">
            28.412s
          </Text>
          <Text variant="detail" mono as="span">
            0x1A2B3C
          </Text>
          <Text variant="label" mono as="span">
            1:24.892
          </Text>
        </div>
      </Section>

      {/* ── Truncate ──────────────────────────────────────────────── */}
      <Section title="Truncation">
        <div style={{ maxWidth: 240 }}>
          <Text variant="caption" truncate>
            This is a very long line of text that should be truncated with an ellipsis when it
            overflows its container width.
          </Text>
        </div>
      </Section>

      {/* ── Polymorphic ───────────────────────────────────────────── */}
      <Section title="Polymorphic (as prop)">
        <Stack gap="xs">
          <Text variant="label" as="h2">
            Rendered as h2
          </Text>
          <Text variant="body" as="p">
            Rendered as p (default)
          </Text>
          <Text variant="caption" as="span" color="secondary">
            Rendered as span
          </Text>
        </Stack>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────── */}
      <Section title="Interactive Playground">
        <Stack gap="md">
          <div className={styles.row} style={{ flexWrap: "wrap" }}>
            <Select
              label="Variant"
              value={variant}
              onChange={(v) => setVariant(v as TextVariant)}
              options={[
                { value: "display", label: "display" },
                { value: "body", label: "body" },
                { value: "caption", label: "caption" },
                { value: "detail", label: "detail" },
                { value: "label", label: "label" },
              ]}
            />
            <Select
              label="Color"
              value={color}
              onChange={(v) => setColor(v as TextColor)}
              options={[
                { value: "primary", label: "primary" },
                { value: "secondary", label: "secondary" },
                { value: "tertiary", label: "tertiary" },
                { value: "accent", label: "accent" },
                { value: "success", label: "success" },
                { value: "error", label: "error" },
              ]}
            />
          </div>
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-recessed)",
              borderRadius: "var(--rialto-radius-default)",
            }}
          >
            <Text variant={variant} color={color}>
              Telemetry data at 100 Hz — 847 channels active
            </Text>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"display" | "body" | "caption" | "detail" | "label"',
              default: '"body"',
              description: "Typography preset controlling size, weight, and tracking.",
            },
            {
              name: "color",
              type: '"primary" | "secondary" | "tertiary" | "accent" | "success" | "error"',
              description: "Text color token. Defaults to each variant's canonical color.",
            },
            {
              name: "as",
              type: "ElementType",
              default: '"p"',
              description: "HTML element to render (polymorphic).",
            },
            {
              name: "mono",
              type: "boolean",
              default: "false",
              description: "Switches to the monospace font family.",
            },
            {
              name: "truncate",
              type: "boolean",
              default: "false",
              description: "Truncates text with ellipsis on overflow.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Semantic HTML",
              value:
                "Use the `as` prop for correct element semantics (h1-h6 for headings)",
            },
            { label: "Color contrast", value: "All color tokens meet WCAG AA on surface backgrounds" },
            {
              label: "Truncation",
              value: "Truncated text should have a title attribute or tooltip with full content",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TextPage.displayName = "TextPage";
