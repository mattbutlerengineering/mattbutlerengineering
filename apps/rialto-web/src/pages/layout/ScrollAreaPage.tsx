import { Card, DataList, ScrollArea, Stack, Text } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TELEMETRY_CHANNELS = [
  "Speed",
  "RPM",
  "Throttle",
  "Brake",
  "Steering Angle",
  "G-Force Lateral",
  "G-Force Longitudinal",
  "Oil Temperature",
  "Water Temperature",
  "Tire Temp FL",
  "Tire Temp FR",
  "Tire Temp RL",
  "Tire Temp RR",
  "Fuel Flow",
  "ERS Deploy",
];

export function ScrollAreaPage() {
  return (
    <ComponentPageLayout
      name="Scroll Area"
      description="Custom-styled scrollbar container. Thin 6px thumb on transparent track, matching the aluminum surface palette. Keyboard-scrollable with focus ring."
    >
      {/* ── Vertical Scroll ───────────────────────────────────────── */}
      <Section title="Vertical Scroll">
        <div className={styles.row} style={{ alignItems: "flex-start" }}>
          <Card style={{ flex: 1 }}>
            <ScrollArea maxHeight={200}>
              {TELEMETRY_CHANNELS.map((channel, i) => (
                <div
                  key={channel}
                  style={{
                    padding: "var(--rialto-space-xs) var(--rialto-space-sm)",
                    borderBottom: "1px solid var(--rialto-border)",
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-secondary)",
                  }}
                >
                  Channel {i + 1} — {channel}
                </div>
              ))}
            </ScrollArea>
          </Card>
          <Card style={{ flex: 1 }}>
            <ScrollArea maxHeight={200}>
              <p
                style={{
                  padding: "var(--rialto-space-sm)",
                  fontSize: "var(--rialto-text-sm)",
                  color: "var(--rialto-text-secondary)",
                  margin: 0,
                }}
              >
                Short content that doesn&apos;t scroll — the scrollbar only appears when needed.
              </p>
            </ScrollArea>
          </Card>
        </div>
      </Section>

      {/* ── Horizontal Scroll ─────────────────────────────────────── */}
      <Section title="Horizontal Scroll">
        <Card>
          <ScrollArea>
            <div style={{ display: "flex", gap: "var(--rialto-space-sm)", minWidth: "max-content" }}>
              {["FP1", "FP2", "FP3", "Quali", "Sprint", "Race"].map((session) => (
                <div
                  key={session}
                  style={{
                    minWidth: 140,
                    padding: "var(--rialto-space-sm)",
                    background: "var(--rialto-surface-recessed)",
                    borderRadius: "var(--rialto-radius-default)",
                    border: "1px solid var(--rialto-border)",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 4px",
                      fontSize: "var(--rialto-text-xs)",
                      fontWeight: "var(--rialto-weight-medium)",
                      color: "var(--rialto-text-primary)",
                    }}
                  >
                    {session}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontFamily: "var(--rialto-font-mono)",
                      fontSize: "var(--rialto-text-sm)",
                      color: "var(--rialto-accent)",
                    }}
                  >
                    1:24.892
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="sm">
          <Text variant="caption" color="secondary">
            Wrap any overflowing content in ScrollArea to get consistent custom scrollbars that
            match the Rialto surface palette. The scrollbar is hidden until the user hovers or
            begins scrolling.
          </Text>
          <Card style={{ width: 280 }}>
            <ScrollArea maxHeight={160}>
              <Stack gap="xs">
                {Array.from({ length: 10 }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--rialto-space-sm)",
                      padding: "var(--rialto-space-xs) 0",
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background:
                          i < 3 ? "var(--rialto-success)" : "var(--rialto-text-tertiary)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "var(--rialto-text-xs)",
                        color: "var(--rialto-text-secondary)",
                      }}
                    >
                      Lap {i + 1}: 1:2{i}.{800 + i * 7}
                    </span>
                  </div>
                ))}
              </Stack>
            </ScrollArea>
          </Card>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "children",
              type: "ReactNode",
              description: "Content to render inside the scrollable area.",
            },
            {
              name: "maxHeight",
              type: "number | string",
              description: "Maximum height before vertical scrolling activates.",
            },
            {
              name: "maxWidth",
              type: "number | string",
              description: "Maximum width before horizontal scrolling activates.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Keyboard", value: "tabindex=0 makes area keyboard-scrollable" },
            { label: "Focus ring", value: "Visible focus ring on keyboard navigation" },
            {
              label: "Scrollbar",
              value: "Custom thumb is decorative — native scroll behavior preserved",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ScrollAreaPage.displayName = "ScrollAreaPage";
