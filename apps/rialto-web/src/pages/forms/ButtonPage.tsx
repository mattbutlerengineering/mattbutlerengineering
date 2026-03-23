import { useState } from "react";
import { Button, Card, Checkbox, DataList, Select, Stack, Text } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

function ButtonPlayground() {
  const [variant, setVariant] = useState<ButtonVariant>("primary");
  const [size, setSize] = useState<ButtonSize>("md");
  const [disabled, setDisabled] = useState(false);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", textAlign: "center" }}>
        <Button variant={variant} size={size} disabled={disabled}>
          Button Label
        </Button>
      </Card>
      <div className={styles.row}>
        <Select
          label="Variant"
          value={variant}
          onChange={(v) => setVariant(v as ButtonVariant)}
          options={[
            { value: "primary", label: "primary" },
            { value: "secondary", label: "secondary" },
            { value: "ghost", label: "ghost" },
          ]}
        />
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as ButtonSize)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ButtonPage() {
  return (
    <ComponentPageLayout
      name="Button"
      description="The hero component. Three variants: gold primary for actions, aluminum secondary for standard interactions, ghost for quiet presence. Press them — feel the depth change."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.row}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <Text variant="caption" color="secondary">
          Primary (gold fill) is reserved for the single most important action on a page. Secondary
          (aluminum) handles standard interactions. Ghost is for quiet, supplementary actions.
        </Text>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.row}>
          <Button size="sm" variant="secondary">
            Small
          </Button>
          <Button size="md" variant="secondary">
            Medium
          </Button>
          <Button size="lg" variant="secondary">
            Large
          </Button>
        </div>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <div className={styles.row}>
          <Button variant="primary">Enabled</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="secondary">Enabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button variant="ghost">Enabled</Button>
          <Button variant="ghost" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Session Configuration
            </Text>
            <Text variant="caption" color="secondary">
              Update your driving mode and system settings before the session begins.
            </Text>
            <div className={styles.row} style={{ justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <Button variant="secondary" size="sm">
                Save Draft
              </Button>
              <Button variant="primary" size="sm">
                Apply Changes
              </Button>
            </div>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <ButtonPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"primary" | "secondary" | "ghost"',
              default: '"secondary"',
              description: "Visual style of the button.",
            },
            {
              name: "size",
              type: '"sm" | "md" | "lg"',
              default: '"md"',
              description: "Size of the button — controls padding and font size.",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Disables the button and removes all interaction.",
            },
            {
              name: "onClick",
              type: "() => void",
              description: "Click handler.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Button label content.",
            },
            {
              name: "className",
              type: "string",
              description: "Additional CSS class name.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <button> element" },
            {
              label: "Keyboard",
              value: "Enter and Space activate the button",
            },
            { label: "Focus", value: "Gold glow focus ring via box-shadow" },
            {
              label: "Disabled",
              value: "aria-disabled applied; pointer events removed",
            },
            {
              label: "Role",
              value: "Implicit role=button from native element",
            },
            {
              label: "Screen reader",
              value:
                "Announces label + 'button'; disabled state announced as 'dimmed' (VoiceOver) or 'unavailable' (NVDA)",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ButtonPage.displayName = "ButtonPage";
