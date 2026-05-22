import { DataList, Stack, Timeline } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TimelinePage() {
  return (
    <ComponentPageLayout
      name="Timeline"
      description="Vertical event log with connected nodes. Gold fills for completed events, glowing ring for the active moment, and muted upcoming items. Mono-spaced timestamps on the left channel."
    >
      {/* ── Full timeline ─────────────────────────────────────────── */}
      <Section title="Full Timeline">
        <Stack direction="row" gap="sm" align="start" wrap>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p
              style={{
                fontSize: "var(--rialto-text-xs)",
                color: "var(--rialto-text-tertiary)",
                marginBottom: "var(--rialto-space-sm)",
              }}
            >
              Race weekend
            </p>
            <Timeline
              events={[
                {
                  title: "Session initialized",
                  timestamp: "14:02",
                  status: "completed",
                  description: "Telemetry link established with pit wall",
                },
                {
                  title: "Systems check passed",
                  timestamp: "14:04",
                  status: "completed",
                },
                {
                  title: "Warm-up lap",
                  timestamp: "14:06",
                  status: "completed",
                  description: "Tyre pressures nominal — 21.4 PSI front, 19.8 PSI rear",
                },
                {
                  title: "Qualifying — hot lap",
                  timestamp: "14:08",
                  status: "active",
                  description: "Sector 1 purple, sector 2 in progress",
                },
                { title: "Cool-down lap", status: "upcoming" },
                { title: "Debrief", status: "upcoming" },
              ]}
            />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p
              style={{
                fontSize: "var(--rialto-text-xs)",
                color: "var(--rialto-text-tertiary)",
                marginBottom: "var(--rialto-space-sm)",
              }}
            >
              CI pipeline
            </p>
            <Timeline
              compact
              events={[
                {
                  title: "Build started",
                  timestamp: "09:31",
                  status: "completed",
                },
                {
                  title: "Tests passed",
                  timestamp: "09:33",
                  status: "completed",
                },
                {
                  title: "Deploy to staging",
                  timestamp: "09:34",
                  status: "completed",
                },
                { title: "Smoke tests", timestamp: "09:35", status: "error" },
                { title: "Rollback", status: "upcoming" },
              ]}
            />
          </div>
        </Stack>
      </Section>

      {/* ── Status Variants ───────────────────────────────────────── */}
      <Section title="Status Variants">
        <Timeline
          events={[
            {
              title: "Completed event",
              status: "completed",
              description: "Gold fill on the node",
            },
            {
              title: "Active event",
              status: "active",
              description: "Glowing gold ring — current moment",
            },
            {
              title: "Error event",
              status: "error",
              description: "Red indicator for failures",
            },
            {
              title: "Upcoming event",
              status: "upcoming",
              description: "Muted node for future items",
            },
          ]}
        />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "events",
              type: "Array<TimelineEvent>",
              description: "List of timeline events to render.",
            },
            {
              name: "compact",
              type: "boolean",
              default: "false",
              description: "Reduces vertical spacing between events.",
            },
          ]}
        />
      </Section>

      {/* ── TimelineEvent Shape ───────────────────────────────────── */}
      <Section title="TimelineEvent Shape">
        <PropsTable
          props={[
            {
              name: "title",
              type: "string",
              description: "Primary event label.",
            },
            {
              name: "status",
              type: '"completed" | "active" | "error" | "upcoming"',
              default: '"upcoming"',
              description: "Visual state of the event node.",
            },
            {
              name: "timestamp",
              type: "string",
              description: "Optional mono-spaced timestamp on the left.",
            },
            {
              name: "description",
              type: "string",
              description: "Optional detail text below the title.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<ol> list with <li> items" },
            { label: "Status", value: "aria-label on each node describes the status" },
            { label: "Timestamps", value: "Wrapped in <time> element" },
            {
              label: "Reading order",
              value: "Linear top-to-bottom DOM order matches visual order",
            },
            {
              label: "Screen reader",
              value:
                "Items announced as list items with position; status indicators need explicit aria-label for screen reader differentiation",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TimelinePage.displayName = "TimelinePage";
