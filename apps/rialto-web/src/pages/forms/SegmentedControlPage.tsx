import { useState } from "react";
import {
  Card,
  Checkbox,
  DataList,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type SegmentedControlSize = "sm" | "md";

function SegmentedControlPlayground() {
  const [value, setValue] = useState("grid");
  const [size, setSize] = useState<SegmentedControlSize>("md");
  const [hasDisabled, setHasDisabled] = useState(false);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <SegmentedControl
          segments={[
            { id: "grid", label: "Grid" },
            { id: "list", label: "List" },
            { id: "table", label: "Table" },
            ...(hasDisabled ? [{ id: "calendar", label: "Calendar", disabled: true }] : []),
          ]}
          value={value}
          onChange={setValue}
          size={size}
        />
      </Card>
      <div className={styles.row}>
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as SegmentedControlSize)}
          options={[
            { value: "md", label: "md" },
            { value: "sm", label: "sm" },
          ]}
        />
        <Checkbox
          label="Show disabled segment"
          checked={hasDisabled}
          onCheckedChange={setHasDisabled}
        />
      </div>
      <Text variant="caption" color="secondary">
        Selected: <strong>{value}</strong>
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SegmentedControlPage() {
  const [segmentedView, setSegmentedView] = useState("grid");

  return (
    <ComponentPageLayout
      name="Segmented Control"
      description="A pill-shaped toggle for mutually exclusive options. The sliding indicator uses spring physics — watch it overshoot and settle like a physical detent."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <SegmentedControl
          segments={[
            { id: "grid", label: "Grid" },
            { id: "list", label: "List" },
            { id: "table", label: "Table" },
          ]}
          value={segmentedView}
          onChange={setSegmentedView}
        />
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.stack}>
          <SegmentedControl
            segments={[
              { id: "a", label: "Segment A" },
              { id: "b", label: "Segment B" },
              { id: "c", label: "Segment C" },
            ]}
            value="a"
            onChange={() => {}}
          />
          <SegmentedControl
            segments={[
              { id: "a", label: "Segment A" },
              { id: "b", label: "Segment B" },
              { id: "c", label: "Segment C" },
            ]}
            value="a"
            onChange={() => {}}
            size="sm"
          />
        </div>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <div className={styles.stack}>
          <SegmentedControl
            segments={[
              { id: "comfort", label: "Comfort" },
              { id: "sport", label: "Sport" },
              { id: "race", label: "Race" },
              { id: "wet", label: "Wet", disabled: true },
            ]}
            value="sport"
            onChange={() => {}}
          />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <div
              className={styles.row}
              style={{ justifyContent: "space-between", flexWrap: "wrap" }}
            >
              <Text variant="label" color="primary">
                Lap Analysis
              </Text>
              <SegmentedControl
                segments={[
                  { id: "chart", label: "Chart" },
                  { id: "data", label: "Data" },
                  { id: "compare", label: "Compare" },
                ]}
                value="chart"
                onChange={() => {}}
                size="sm"
              />
            </div>
            <div
              style={{
                height: 120,
                background: "var(--rialto-surface-recessed)",
                borderRadius: "var(--rialto-radius-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text variant="caption" color="tertiary">
                Chart view content
              </Text>
            </div>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <SegmentedControlPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "segments",
              type: "Array<{ id: string; label: string; disabled?: boolean }>",
              description: "List of segments to render.",
            },
            {
              name: "value",
              type: "string",
              description: "Currently selected segment id.",
            },
            {
              name: "onChange",
              type: "(value: string) => void",
              description: "Called when selection changes.",
            },
            {
              name: "size",
              type: '"sm" | "md"',
              default: '"md"',
              description: "Size of the control.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=tablist with role=tab for each segment" },
            { label: "State", value: "aria-selected=true on active segment" },
            { label: "Keyboard", value: "Arrow Left/Right navigate between segments" },
            { label: "Keyboard", value: "Home/End jump to first/last segment" },
            { label: "Disabled", value: "aria-disabled=true on disabled segments" },
            {
              label: "Screen reader",
              value:
                "Announces as radio group; each segment announced with label + 'radio button' + selected state; selection change announced immediately",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SegmentedControlPage.displayName = "SegmentedControlPage";
