import { Breadcrumb, DataList, Stack } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BreadcrumbPage() {
  return (
    <ComponentPageLayout
      name="Breadcrumb"
      description="Navigation trail with chevron separators. Gold hover on links, medium weight on current page. Collapses deep paths with ellipsis."
    >
      {/* ── Short Path ────────────────────────────────────────────── */}
      <Section title="Short Path">
        <Breadcrumb
          items={[
            { label: "Home", href: "#" },
            { label: "Vehicles", href: "#" },
            { label: "F80" },
          ]}
        />
      </Section>

      {/* ── Deep Path ─────────────────────────────────────────────── */}
      <Section title="Deep Path">
        <Breadcrumb
          items={[
            { label: "Home", href: "#" },
            { label: "Telemetry", href: "#" },
            { label: "Sessions", href: "#" },
            { label: "Fiorano", href: "#" },
            { label: "Lap 14" },
          ]}
        />
      </Section>

      {/* ── Collapsed ─────────────────────────────────────────────── */}
      <Section title="Collapsed (maxItems=3)">
        <Breadcrumb
          items={[
            { label: "Home", href: "#" },
            { label: "Telemetry", href: "#" },
            { label: "Sessions", href: "#" },
            { label: "Fiorano", href: "#" },
            { label: "Sector Analysis", href: "#" },
            { label: "Lap 14" },
          ]}
          maxItems={3}
        />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
            }}
          >
            <Breadcrumb
              items={[
                { label: "Dashboard", href: "#" },
                { label: "Drivers", href: "#" },
                { label: "Charles Leclerc", href: "#" },
                { label: "Lap Analysis" },
              ]}
            />
          </div>
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-elevated)",
              borderRadius: "var(--rialto-radius-soft)",
              border: "1px solid var(--rialto-border)",
            }}
          >
            <Breadcrumb
              items={[
                { label: "Settings", href: "#" },
                { label: "Team", href: "#" },
                { label: "Members", href: "#" },
                { label: "Add Member" },
              ]}
              maxItems={3}
            />
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "items",
              type: "Array<{ label: string; href?: string }>",
              description: "Breadcrumb trail. Last item without href is the current page.",
            },
            {
              name: "maxItems",
              type: "number",
              description: "Collapses middle items with ellipsis when trail exceeds this count.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<nav aria-label='Breadcrumb'> with <ol> list" },
            { label: "Current", value: "aria-current='page' on the last (current) item" },
            { label: "Links", value: "Previous steps rendered as <a> elements" },
            { label: "Keyboard", value: "Tab to navigate between links" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

BreadcrumbPage.displayName = "BreadcrumbPage";
