import { DataList, Stack, Tabs, Text } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TabsPage() {
  return (
    <ComponentPageLayout
      name="Tabs"
      description="The gold indicator slides between tabs with spring physics — the same detent-snap feel as the toggle. Arrow keys navigate. Watch the bar overshoot and settle."
    >
      {/* ── Basic tabs ────────────────────────────────────────────── */}
      <Section title="Basic">
        <Tabs
          tabs={[
            {
              id: "performance",
              label: "Performance",
              content: (
                <Text variant="caption" color="secondary">
                  Twin-turbocharged V6 hybrid producing 1,200 PS. The most powerful road car
                  we&apos;ve ever built.
                </Text>
              ),
            },
            {
              id: "chassis",
              label: "Chassis",
              content: (
                <Text variant="caption" color="secondary">
                  Carbon fiber monocoque with aluminum subframes. Active aerodynamics with
                  adjustable downforce.
                </Text>
              ),
            },
            {
              id: "interior",
              label: "Interior",
              content: (
                <Text variant="caption" color="secondary">
                  Anodized aluminum surfaces, Gorilla Glass instrument panel, physical controls
                  with tactile feedback.
                </Text>
              ),
            },
            {
              id: "limited",
              label: "Availability",
              disabled: true,
              content: null,
            },
          ]}
        />
      </Section>

      {/* ── Multiple tabs ─────────────────────────────────────────── */}
      <Section title="More Tabs">
        <Tabs
          tabs={[
            { id: "overview", label: "Overview", content: <Text variant="caption" color="secondary">Session overview content.</Text> },
            { id: "telemetry", label: "Telemetry", content: <Text variant="caption" color="secondary">Live telemetry data.</Text> },
            { id: "analysis", label: "Analysis", content: <Text variant="caption" color="secondary">Lap analysis and sector breakdowns.</Text> },
            { id: "setup", label: "Setup", content: <Text variant="caption" color="secondary">Vehicle configuration and setup sheet.</Text> },
            { id: "weather", label: "Weather", content: <Text variant="caption" color="secondary">Track weather and conditions.</Text> },
          ]}
          defaultTab="overview"
        />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <Text variant="label" color="primary">
            Session Details
          </Text>
          <Tabs
            tabs={[
              {
                id: "lap-times",
                label: "Lap Times",
                content: (
                  <Stack gap="sm">
                    {[
                      { lap: 1, time: "1:28.102", delta: "+2.692" },
                      { lap: 2, time: "1:26.551", delta: "+1.141" },
                      { lap: 3, time: "1:25.410", delta: "—" },
                    ].map((row) => (
                      <div
                        key={row.lap}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "var(--rialto-space-xs) 0",
                          borderBottom: "1px solid var(--rialto-border)",
                          fontSize: "var(--rialto-text-sm)",
                          color: "var(--rialto-text-secondary)",
                          fontFamily: "var(--rialto-font-mono)",
                        }}
                      >
                        <span>Lap {row.lap}</span>
                        <span>{row.time}</span>
                        <span
                          style={{
                            color:
                              row.delta === "—"
                                ? "var(--rialto-success)"
                                : "var(--rialto-text-tertiary)",
                          }}
                        >
                          {row.delta}
                        </span>
                      </div>
                    ))}
                  </Stack>
                ),
              },
              {
                id: "sector-times",
                label: "Sector Times",
                content: (
                  <Text variant="caption" color="secondary">
                    Sector breakdowns for each lap.
                  </Text>
                ),
              },
            ]}
          />
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "tabs",
              type: "Array<Tab>",
              description: "Tab definitions with id, label, content, and optional disabled.",
            },
            {
              name: "activeId",
              type: "string",
              description: "Controlled active tab ID.",
            },
            {
              name: "defaultTab",
              type: "string",
              description: "Uncontrolled initial active tab.",
            },
            {
              name: "onChange",
              type: "(id: string) => void",
              description: "Called when active tab changes.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=tablist with role=tab and role=tabpanel" },
            { label: "State", value: "aria-selected=true on active tab" },
            { label: "Panels", value: "aria-labelledby links panel to its tab" },
            { label: "Keyboard", value: "Arrow Left/Right navigate between tabs" },
            { label: "Keyboard", value: "Home/End jump to first/last tab" },
            { label: "Disabled", value: "aria-disabled=true on disabled tabs" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TabsPage.displayName = "TabsPage";
