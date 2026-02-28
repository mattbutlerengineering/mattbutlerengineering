import { DataList, Text } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SidebarPage() {
  return (
    <ComponentPageLayout
      name="Sidebar"
      description="Vertical app navigation with header, search, and collapsible sections. The Sidebar component in this showcase is itself a Rialto Sidebar — this page documents its API."
    >
      {/* ── Live Example ──────────────────────────────────────────── */}
      <Section title="Live Demo">
        <Text variant="caption" color="secondary">
          The sidebar on the left of this showcase is a live Rialto Sidebar instance. It
          demonstrates: section grouping, active item highlighting, keyboard navigation, and
          collapsing behavior on narrow screens.
        </Text>
      </Section>

      {/* ── Key Features ──────────────────────────────────────────── */}
      <Section title="Key Features">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "var(--rialto-space-md)",
          }}
        >
          {[
            { title: "Section Groups", desc: "Items organized into labeled sections" },
            { title: "Active States", desc: "Gold accent on the selected item" },
            { title: "Keyboard Nav", desc: "Arrow keys navigate the item list" },
            { title: "Collapse", desc: "Individual sections can collapse" },
          ].map(({ title, desc }) => (
            <div
              key={title}
              style={{
                padding: "var(--rialto-space-md)",
                background: "var(--rialto-surface-elevated)",
                borderRadius: "var(--rialto-radius-soft)",
                border: "1px solid var(--rialto-border)",
              }}
            >
              <p
                style={{
                  fontSize: "var(--rialto-text-sm)",
                  fontWeight: "var(--rialto-weight-medium)",
                  color: "var(--rialto-text-primary)",
                  marginBottom: "var(--rialto-space-2xs)",
                }}
              >
                {title}
              </p>
              <p
                style={{
                  fontSize: "var(--rialto-text-xs)",
                  color: "var(--rialto-text-secondary)",
                }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "sections",
              type: "Array<{ label: string; items: SidebarItem[] }>",
              description: "Navigation sections, each with a label and list of items.",
            },
            {
              name: "activeId",
              type: "string",
              description: "ID of the currently active/selected item.",
            },
            {
              name: "onItemClick",
              type: "(id: string) => void",
              description: "Called when a nav item is clicked.",
            },
            {
              name: "collapsed",
              type: "boolean",
              default: "false",
              description: "Collapses the sidebar to icons-only mode.",
            },
            {
              name: "onCollapse",
              type: "(collapsed: boolean) => void",
              description: "Called when the collapse state changes.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<nav aria-label='Sidebar navigation'>" },
            { label: "Active", value: "aria-current='page' on the active item" },
            { label: "Groups", value: "<ul role=group> per section, <li> per item" },
            { label: "Keyboard", value: "Arrow Up/Down navigate items; Enter activates" },
            { label: "Focus", value: "Gold glow ring on focused item" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SidebarPage.displayName = "SidebarPage";
