import { Badge, Button, DataList, Select, Stack, Tag, Text } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Gap = "xs" | "sm" | "md" | "lg" | "xl";
type Direction = "row" | "column";
type Align = "start" | "center" | "end" | "stretch";
type Justify = "start" | "center" | "end" | "between";

export function StackPage() {
  const [direction, setDirection] = useState<Direction>("column");
  const [gap, setGap] = useState<Gap>("md");
  const [align, setAlign] = useState<Align>("start");
  const [justify, setJustify] = useState<Justify>("start");

  return (
    <ComponentPageLayout
      name="Stack"
      description="Flex layout primitive. Vertical by default, with gap mapped to the spacing scale. Replaces one-off CSS flex containers throughout the system."
    >
      {/* ── Vertical ──────────────────────────────────────────────── */}
      <Section title="Vertical (default)">
        <Stack gap="xs">
          <Badge variant="neutral">First</Badge>
          <Badge variant="neutral">Second</Badge>
          <Badge variant="neutral">Third</Badge>
        </Stack>
      </Section>

      {/* ── Horizontal ────────────────────────────────────────────── */}
      <Section title="Horizontal">
        <Stack direction="row" gap="xs" align="center">
          <Badge variant="accent">Speed</Badge>
          <Badge variant="success">Nominal</Badge>
          <Badge variant="error">Alert</Badge>
          <Text variant="detail" as="span">
            3 channels active
          </Text>
        </Stack>
      </Section>

      {/* ── Row with Wrap ─────────────────────────────────────────── */}
      <Section title="Row with Wrap">
        <Stack direction="row" gap="xs" wrap>
          {["Fiorano", "Monza", "Mugello", "Imola", "Spa", "Silverstone", "Suzuka", "Monaco"].map(
            (track) => (
              <Tag key={track}>{track}</Tag>
            )
          )}
        </Stack>
      </Section>

      {/* ── Justify Between ───────────────────────────────────────── */}
      <Section title="Justify Between">
        <Stack direction="row" gap="sm" align="center" justify="between">
          <Text variant="caption" as="span">
            Telemetry v4.2.1
          </Text>
          <Button variant="ghost" size="sm">
            View Details
          </Button>
        </Stack>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────── */}
      <Section title="Interactive Playground">
        <Stack gap="md">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--rialto-space-sm)",
              alignItems: "flex-end",
            }}
          >
            <Select
              label="Direction"
              value={direction}
              onChange={(v) => setDirection(v as Direction)}
              options={[
                { value: "column", label: "column" },
                { value: "row", label: "row" },
              ]}
            />
            <Select
              label="Gap"
              value={gap}
              onChange={(v) => setGap(v as Gap)}
              options={[
                { value: "xs", label: "xs" },
                { value: "sm", label: "sm" },
                { value: "md", label: "md" },
                { value: "lg", label: "lg" },
                { value: "xl", label: "xl" },
              ]}
            />
            <Select
              label="Align"
              value={align}
              onChange={(v) => setAlign(v as Align)}
              options={[
                { value: "start", label: "start" },
                { value: "center", label: "center" },
                { value: "end", label: "end" },
                { value: "stretch", label: "stretch" },
              ]}
            />
            <Select
              label="Justify"
              value={justify}
              onChange={(v) => setJustify(v as Justify)}
              options={[
                { value: "start", label: "start" },
                { value: "center", label: "center" },
                { value: "end", label: "end" },
                { value: "between", label: "between" },
              ]}
            />
          </div>
          <div
            style={{
              padding: "var(--rialto-space-md)",
              background: "var(--rialto-surface-recessed)",
              borderRadius: "var(--rialto-radius-default)",
              minHeight: 100,
            }}
          >
            <Stack direction={direction} gap={gap} align={align} justify={justify}>
              <Badge variant="accent">Alpha</Badge>
              <Badge variant="neutral">Beta</Badge>
              <Badge variant="success">Gamma</Badge>
            </Stack>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "direction",
              type: '"row" | "column"',
              default: '"column"',
              description: "Flex direction.",
            },
            {
              name: "gap",
              type: '"xs" | "sm" | "md" | "lg" | "xl"',
              default: '"md"',
              description: "Space between children, mapped to spacing tokens.",
            },
            {
              name: "align",
              type: '"start" | "center" | "end" | "stretch"',
              description: "Cross-axis alignment (align-items).",
            },
            {
              name: "justify",
              type: '"start" | "center" | "end" | "between"',
              description: "Main-axis justification (justify-content).",
            },
            {
              name: "wrap",
              type: "boolean",
              default: "false",
              description: "Allows children to wrap to multiple lines.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Content to lay out.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<div> with display: flex" },
            {
              label: "Semantics",
              value: "Purely presentational — add semantic wrappers as needed",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

StackPage.displayName = "StackPage";
