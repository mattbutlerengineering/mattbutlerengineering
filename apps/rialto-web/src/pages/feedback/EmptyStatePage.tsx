import { Button, DataList, EmptyState, Stack } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function EmptyStatePage() {
  return (
    <ComponentPageLayout
      name="Empty State"
      description="A centered composition for 'no data' moments — empty tables, blank dashboards, post-deletion confirmations. Icon + heading + description + optional action in a vertical stack."
    >
      {/* ── Default ───────────────────────────────────────────────── */}
      <Section title="Default with Action">
        <EmptyState
          heading="No sessions found"
          description="You haven't recorded any telemetry sessions yet. Start a new session to begin collecting data."
          action={
            <Button variant="primary" size="sm">
              New Session
            </Button>
          }
        />
      </Section>

      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.stack}>
          <EmptyState
            variant="elevated"
            heading="No lap data"
            description="Complete a lap to see timing and sector analysis here."
            action={
              <Button variant="secondary" size="sm">
                Go to Track
              </Button>
            }
          />
        </div>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.stack}>
          <EmptyState
            size="sm"
            heading="No alerts"
            description="All systems nominal. Alerts will appear here when triggered."
          />
        </div>
      </Section>

      {/* ── Custom Icon ───────────────────────────────────────────── */}
      <Section title="Custom Icon">
        <EmptyState
          icon={
            <svg
              viewBox="0 0 40 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="20" cy="20" r="14" />
              <path d="M20 12v8l5 3" />
            </svg>
          }
          heading="Session expired"
          description="Your telemetry session has timed out. Reconnect to continue live monitoring."
          action={
            <Button variant="primary" size="sm">
              Reconnect
            </Button>
          }
        />
      </Section>

      {/* ── Minimal ───────────────────────────────────────────────── */}
      <Section title="Minimal (heading only)">
        <EmptyState heading="No filters applied" />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <div
            style={{
              border: "1px solid var(--rialto-border)",
              borderRadius: "var(--rialto-radius-soft)",
              overflow: "hidden",
            }}
          >
            {/* Simulated table header */}
            <div
              style={{
                display: "flex",
                padding: "var(--rialto-space-sm) var(--rialto-space-md)",
                borderBottom: "1px solid var(--rialto-border)",
                background: "var(--rialto-surface-recessed)",
                gap: "var(--rialto-space-lg)",
              }}
            >
              {["Driver", "Team", "Lap Time", "Gap"].map((col) => (
                <span
                  key={col}
                  style={{
                    fontSize: "var(--rialto-text-xs)",
                    fontWeight: "var(--rialto-weight-medium)",
                    color: "var(--rialto-text-tertiary)",
                    flex: 1,
                  }}
                >
                  {col}
                </span>
              ))}
            </div>
            {/* Empty body */}
            <div style={{ padding: "var(--rialto-space-xl)" }}>
              <EmptyState
                size="sm"
                heading="No lap times recorded"
                description="Start a timing session to populate this table."
              />
            </div>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "heading",
              type: "string",
              description: "Primary heading text.",
            },
            {
              name: "description",
              type: "string",
              description: "Supporting text below the heading.",
            },
            {
              name: "icon",
              type: "ReactNode",
              description: "Custom icon element. Defaults to a system icon if omitted.",
            },
            {
              name: "action",
              type: "ReactNode",
              description: "Optional action element (e.g. a Button) below the description.",
            },
            {
              name: "variant",
              type: '"default" | "elevated"',
              default: '"default"',
              description: "Surface variant. Elevated adds a card-like background.",
            },
            {
              name: "size",
              type: '"sm" | "md"',
              default: '"md"',
              description: "Controls spacing and text size.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Heading", value: "Rendered as <p> with appropriate size — not a heading element" },
            {
              label: "Icon",
              value: "aria-hidden=true — decorative, not conveying meaning",
            },
            { label: "Action", value: "Action button is keyboard focusable" },
            {
              label: "Pattern",
              value: "Replace table/list content with EmptyState — don't hide the region",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

EmptyStatePage.displayName = "EmptyStatePage";
