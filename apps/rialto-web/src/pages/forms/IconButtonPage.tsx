import { useState } from "react";
import { Bell, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Card, IconButton, Select, Stack, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type IconButtonVariant = "primary" | "secondary" | "ghost";
type IconButtonSize = "sm" | "md" | "lg";

const GLYPH_SIZE: Record<IconButtonSize, number> = { sm: 14, md: 18, lg: 20 };

function IconButtonPlayground() {
  const [variant, setVariant] = useState<IconButtonVariant>("ghost");
  const [size, setSize] = useState<IconButtonSize>("md");

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", textAlign: "center" }}>
        <IconButton
          variant={variant}
          size={size}
          aria-label="Add item"
          icon={<Plus size={GLYPH_SIZE[size]} />}
        />
      </Card>
      <div className={styles.row}>
        <Select
          label="Variant"
          value={variant}
          onChange={(v) => setVariant(v as IconButtonVariant)}
          options={[
            { value: "primary", label: "primary" },
            { value: "secondary", label: "secondary" },
            { value: "ghost", label: "ghost" },
          ]}
        />
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as IconButtonSize)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
          ]}
        />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function IconButtonPage() {
  return (
    <ComponentPageLayout
      name="IconButton"
      description="Icon-only action trigger for toolbars, dismiss affordances, and dense controls. Composes Button, so it inherits the same variants, focus-ring, and tactile press-depth — and requires an aria-label so screen readers always have a name to announce."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.row}>
          <IconButton variant="primary" aria-label="Add" icon={<Plus size={18} />} />
          <IconButton variant="secondary" aria-label="Edit" icon={<Pencil size={18} />} />
          <IconButton variant="ghost" aria-label="Search" icon={<Search size={18} />} />
        </div>
        <Text variant="caption" color="secondary">
          Ghost is the default — quiet enough for toolbars and dismiss buttons. Secondary adds an
          aluminum outline; primary (gold fill) is reserved for a single prominent action.
        </Text>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.row}>
          <IconButton size="sm" variant="secondary" aria-label="Add" icon={<Plus size={14} />} />
          <IconButton size="md" variant="secondary" aria-label="Add" icon={<Plus size={18} />} />
          <IconButton size="lg" variant="secondary" aria-label="Add" icon={<Plus size={20} />} />
        </div>
        <Text variant="caption" color="secondary">
          Square footprints of 28 / 36 / 44px. Size the glyph to match (≈14 / 18 / 20px).
        </Text>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <div className={styles.row}>
          <IconButton variant="secondary" aria-label="Notifications" icon={<Bell size={18} />} />
          <IconButton
            variant="secondary"
            aria-label="Notifications"
            icon={<Bell size={18} />}
            disabled
          />
        </div>
        <Text variant="caption" color="secondary">
          Disabled buttons drop their shadow and press feedback, matching Button.
        </Text>
      </Section>

      {/* ── Common Uses ───────────────────────────────────────────── */}
      <Section title="Common Uses">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack direction="row" gap="sm" align="center" justify="end" wrap>
            <IconButton variant="ghost" aria-label="Edit entry" icon={<Pencil size={18} />} />
            <IconButton variant="ghost" aria-label="Delete entry" icon={<Trash2 size={18} />} />
            <IconButton variant="ghost" aria-label="Dismiss" icon={<X size={18} />} />
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <IconButtonPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="IconButton" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <Stack gap="sm">
          <Text variant="caption" color="secondary">
            IconButton has no visible text, so the <code>aria-label</code> prop is required at the
            type level — omitting it is a compile error. The label becomes the button&apos;s
            accessible name, and the icon is rendered <code>aria-hidden</code>.
          </Text>
          <Text variant="caption" color="secondary">
            Focus shows the gold focus-ring, and the button is fully keyboard operable, inheriting
            both from Button.
          </Text>
        </Stack>
      </Section>
    </ComponentPageLayout>
  );
}

IconButtonPage.displayName = "IconButtonPage";
