import { useState } from "react";
import { Button, Card, DataList, Input, InputGroup, Select, Stack, Text } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type GroupLayout = "input-button" | "select-input" | "input-input";

function InputGroupPlayground() {
  const [layout, setLayout] = useState<GroupLayout>("input-button");
  const [value, setValue] = useState("");

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
        {layout === "input-button" && (
          <InputGroup>
            <Input
              placeholder="Enter value..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Button variant="primary">Submit</Button>
          </InputGroup>
        )}
        {layout === "select-input" && (
          <InputGroup>
            <Select
              options={[
                { value: "kg", label: "kg" },
                { value: "lb", label: "lb" },
                { value: "g", label: "g" },
              ]}
              value="kg"
              onChange={() => undefined}
            />
            <Input placeholder="Amount..." />
          </InputGroup>
        )}
        {layout === "input-input" && (
          <InputGroup>
            <Input placeholder="Min..." />
            <Input placeholder="Max..." />
          </InputGroup>
        )}
      </Card>
      <Select
        label="Layout"
        value={layout}
        onChange={(v) => setLayout(v as GroupLayout)}
        options={[
          { value: "input-button", label: "Input + Button" },
          { value: "select-input", label: "Select + Input" },
          { value: "input-input", label: "Input + Input" },
        ]}
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function InputGroupPage() {
  return (
    <ComponentPageLayout
      name="InputGroup"
      description="Connects adjacent form controls into a single row by removing internal border radii and collapsing double borders. Works with Input, Select, and Button."
    >
      {/* ── Input + Button ────────────────────────────────────────────── */}
      <Section title="Input + Button">
        <Stack gap="sm">
          <InputGroup>
            <Input placeholder="Search telemetry data..." />
            <Button variant="primary">Search</Button>
          </InputGroup>
          <Text variant="caption" color="secondary">
            The most common pattern — a text input with a submit action.
          </Text>
        </Stack>
      </Section>

      {/* ── Select + Input ────────────────────────────────────────────── */}
      <Section title="Select + Input">
        <Stack gap="sm">
          <InputGroup>
            <Select
              options={[
                { value: "rpm", label: "RPM" },
                { value: "mph", label: "MPH" },
                { value: "celsius", label: "°C" },
              ]}
              value="rpm"
              onChange={() => undefined}
            />
            <Input placeholder="Enter threshold..." />
          </InputGroup>
          <Text variant="caption" color="secondary">
            Unit selector paired with a value field — borders collapse at the join.
          </Text>
        </Stack>
      </Section>

      {/* ── Input + Input (Range) ─────────────────────────────────────── */}
      <Section title="Input + Input (Range)">
        <Stack gap="sm">
          <InputGroup>
            <Input placeholder="From..." />
            <Input placeholder="To..." />
          </InputGroup>
          <Text variant="caption" color="secondary">
            Two inputs joined for a range entry without needing a separator element.
          </Text>
        </Stack>
      </Section>

      {/* ── Triple combination ────────────────────────────────────────── */}
      <Section title="Select + Input + Button">
        <Stack gap="sm">
          <InputGroup>
            <Select
              options={[
                { value: "speed", label: "Speed" },
                { value: "gear", label: "Gear" },
                { value: "temp", label: "Temp" },
              ]}
              value="speed"
              onChange={() => undefined}
            />
            <Input placeholder="Threshold value..." />
            <Button variant="secondary">Apply</Button>
          </InputGroup>
          <Text variant="caption" color="secondary">
            Three controls joined into one cohesive input row.
          </Text>
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Telemetry Filter
            </Text>
            <Text variant="caption" color="secondary">
              Filter session data by channel and threshold range.
            </Text>
            <Stack gap="sm">
              <InputGroup>
                <Select
                  options={[
                    { value: "speed", label: "Speed" },
                    { value: "rpm", label: "Engine RPM" },
                    { value: "brake", label: "Brake Pressure" },
                    { value: "throttle", label: "Throttle" },
                  ]}
                  value="speed"
                  onChange={() => undefined}
                />
                <Input placeholder="Min value..." />
                <Input placeholder="Max value..." />
              </InputGroup>
              <div className={styles.row} style={{ justifyContent: "flex-end" }}>
                <Button variant="ghost" size="sm">
                  Reset
                </Button>
                <Button variant="primary" size="sm">
                  Apply Filter
                </Button>
              </div>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <InputGroupPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "children",
              type: "ReactNode",
              description:
                "Adjacent form controls (Input, Button, Select) to visually join together.",
            },
            {
              name: "className",
              type: "string",
              description: "Additional CSS class for the group wrapper.",
            },
            {
              name: "...HTMLDivAttributes",
              type: "HTMLAttributes<HTMLDivElement>",
              description: "All standard div attributes are forwarded to the wrapper element.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Role",
              value: "role=group applied to the wrapper — semantically groups related controls",
            },
            {
              label: "Children",
              value: "Each child retains its own accessible label and role",
            },
            {
              label: "Keyboard",
              value: "Tab order follows DOM order through all grouped controls",
            },
            {
              label: "Labeling",
              value:
                "Add an aria-label or aria-labelledby to the InputGroup when context is unclear",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

InputGroupPage.displayName = "InputGroupPage";
