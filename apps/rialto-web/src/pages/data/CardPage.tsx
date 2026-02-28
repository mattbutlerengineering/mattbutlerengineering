import { Button, Card, Checkbox, DataList, Select, Stack, Text } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type CardVariant = "elevated" | "glass" | "flat";

function CardPlayground() {
  const [variant, setVariant] = useState<CardVariant>("elevated");
  const [tilt, setTilt] = useState(false);
  const [hasTitle, setHasTitle] = useState(true);
  const [hasSubtitle, setHasSubtitle] = useState(true);

  return (
    <Stack gap="lg">
      <div style={{ maxWidth: 320 }}>
        <Card
          variant={variant}
          tilt={tilt}
          title={hasTitle ? "Card Title" : undefined}
          subtitle={hasSubtitle ? "Card subtitle" : undefined}
        >
          <Text variant="caption" color="secondary">
            Card body content — any React node can go here.
          </Text>
        </Card>
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Variant"
          value={variant}
          onChange={(v) => setVariant(v as CardVariant)}
          options={[
            { value: "elevated", label: "elevated" },
            { value: "glass", label: "glass" },
            { value: "flat", label: "flat" },
          ]}
        />
        <Checkbox label="3D tilt" checked={tilt} onCheckedChange={setTilt} />
        <Checkbox label="Show title" checked={hasTitle} onCheckedChange={setHasTitle} />
        <Checkbox label="Show subtitle" checked={hasSubtitle} onCheckedChange={setHasSubtitle} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CardPage() {
  return (
    <ComponentPageLayout
      name="Card"
      description="The jewelry box. Three surface treatments: polished aluminum elevation, frosted glass translucency, and flat for quiet grouping."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.cardGrid}>
          <Card title="Elevated" subtitle="Polished aluminum">
            <Text variant="caption" color="secondary">
              Subtle lift with precision border. The default content container.
            </Text>
          </Card>
          <Card variant="glass" title="Glass" subtitle="Frosted Gorilla Glass">
            <Text variant="caption" color="secondary">
              The Rialto effect — backdrop blur with warm translucency. For floating panels.
            </Text>
          </Card>
          <Card variant="flat" title="Flat" subtitle="Brushed matte">
            <Text variant="caption" color="secondary">
              Quiet presence. No shadow. For secondary groupings and nested content.
            </Text>
          </Card>
        </div>
      </Section>

      {/* ── 3D Tilt ───────────────────────────────────────────────── */}
      <Section title="3D Tilt">
        <div className={styles.cardGrid}>
          <Card tilt title="Hover to interact" subtitle="Cursor-tracking tilt">
            <Text variant="caption" color="secondary">
              Move your mouse across this card to see the specular highlight follow.
            </Text>
          </Card>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <div className={styles.cardGrid}>
          <Card variant="elevated">
            <Stack gap="sm">
              <div className={styles.row} style={{ justifyContent: "space-between" }}>
                <Text variant="label" color="primary">
                  Lap Time
                </Text>
                <Text variant="detail" color="tertiary">
                  Lap 14
                </Text>
              </div>
              <Text variant="display" color="primary">
                1:25.410
              </Text>
              <Text variant="caption" color="success">
                −0.342 personal best
              </Text>
            </Stack>
          </Card>
          <Card variant="glass">
            <Stack gap="sm">
              <Text variant="label" color="primary">
                Tire Status
              </Text>
              <DataList
                items={[
                  { label: "Front Left", value: "32.1 PSI" },
                  { label: "Front Right", value: "31.8 PSI" },
                  { label: "Rear Left", value: "28.4 PSI" },
                  { label: "Rear Right", value: "31.2 PSI" },
                ]}
              />
            </Stack>
          </Card>
          <Card variant="flat">
            <Stack gap="md">
              <Text variant="label" color="primary">
                Session Info
              </Text>
              <Text variant="caption" color="secondary">
                FP1 — Fiorano Circuit. Ambient: 22°C, Track: 38°C, Humidity: 45%.
              </Text>
              <Button variant="secondary" size="sm">
                View Full Report
              </Button>
            </Stack>
          </Card>
        </div>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <CardPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"elevated" | "glass" | "flat"',
              default: '"elevated"',
              description: "Surface treatment for the card.",
            },
            {
              name: "title",
              type: "string",
              description: "Optional card heading.",
            },
            {
              name: "subtitle",
              type: "string",
              description: "Optional secondary line below the title.",
            },
            {
              name: "tilt",
              type: "boolean",
              default: "false",
              description: "Enables cursor-tracking 3D tilt with specular highlight.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Card body content.",
            },
            {
              name: "onClick",
              type: "() => void",
              description: "Makes the card interactive.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<article> or <div> depending on context" },
            { label: "Interactive", value: "Add role=button and tabIndex=0 for clickable cards" },
            { label: "Focus", value: "Gold glow ring when card is focusable" },
            { label: "Keyboard", value: "Enter or Space to activate if onClick provided" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

CardPage.displayName = "CardPage";
