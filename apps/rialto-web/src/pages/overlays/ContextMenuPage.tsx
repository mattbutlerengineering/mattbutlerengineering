import { Card, ContextMenu, DataList, Stack, Text, useToast } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ContextMenuPage() {
  const { toast } = useToast();

  return (
    <ComponentPageLayout
      name="Context Menu"
      description="Right-click triggered action menu. Reuses the same item pattern as Dropdown Menu — keyboard navigation, dividers, destructive items. Fixed position at click coordinates with viewport boundary detection."
    >
      {/* ── Basic ─────────────────────────────────────────────────── */}
      <Section title="Basic">
        <ContextMenu
          items={[
            {
              id: "copy",
              label: "Copy",
              shortcut: "⌘C",
              onSelect: () => toast({ title: "Copied" }),
            },
            {
              id: "paste",
              label: "Paste",
              shortcut: "⌘V",
              onSelect: () => toast({ title: "Pasted" }),
            },
            { type: "divider" },
            { type: "label", label: "Telemetry" },
            {
              id: "export",
              label: "Export",
              onSelect: () => toast({ title: "Exporting..." }),
            },
            {
              id: "share",
              label: "Share",
              onSelect: () => toast({ title: "Link copied", variant: "success" }),
            },
            { type: "divider" },
            {
              id: "delete",
              label: "Delete",
              destructive: true,
              onSelect: () => toast({ title: "Deleted", variant: "error" }),
            },
          ]}
        >
          <Card style={{ padding: "var(--rialto-space-xl)", textAlign: "center" }}>
            <Text variant="caption" color="tertiary">
              Right-click this area
            </Text>
          </Card>
        </ContextMenu>
      </Section>

      {/* ── Table Row Context ─────────────────────────────────────── */}
      <Section title="Table Row Context">
        <Stack gap="xs">
          {[
            { driver: "Charles Leclerc", time: "1:24.892", gap: "—" },
            { driver: "Carlos Sainz", time: "1:25.134", gap: "+0.242" },
            { driver: "George Russell", time: "1:25.301", gap: "+0.409" },
          ].map((row) => (
            <ContextMenu
              key={row.driver}
              items={[
                {
                  id: "view",
                  label: "View Details",
                  onSelect: () => toast({ title: `Viewing ${row.driver}` }),
                },
                {
                  id: "compare",
                  label: "Compare Lap",
                  onSelect: () => toast({ title: `Comparing ${row.driver}` }),
                },
                { type: "divider" },
                {
                  id: "flag",
                  label: "Flag as anomaly",
                  destructive: true,
                  onSelect: () => toast({ title: "Flagged", variant: "error" }),
                },
              ]}
            >
              <div
                style={{
                  display: "flex",
                  padding: "var(--rialto-space-xs) var(--rialto-space-md)",
                  borderRadius: "var(--rialto-radius-default)",
                  border: "1px solid var(--rialto-border)",
                  cursor: "context-menu",
                  gap: "var(--rialto-space-lg)",
                  alignItems: "center",
                  background: "var(--rialto-surface-elevated)",
                }}
              >
                <span
                  style={{
                    flex: 2,
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-primary)",
                  }}
                >
                  {row.driver}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontFamily: "var(--rialto-font-mono)",
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-secondary)",
                  }}
                >
                  {row.time}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontFamily: "var(--rialto-font-mono)",
                    fontSize: "var(--rialto-text-xs)",
                    color:
                      row.gap === "—" ? "var(--rialto-accent)" : "var(--rialto-text-tertiary)",
                  }}
                >
                  {row.gap}
                </span>
              </div>
            </ContextMenu>
          ))}
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "children",
              type: "ReactNode",
              description: "The target element — right-click anywhere within it to trigger.",
            },
            {
              name: "items",
              type: "Array<MenuItem | DividerItem | LabelItem>",
              description: "Same item type as DropdownMenu.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Trigger", value: "contextmenu event (right-click or Shift+F10)" },
            { label: "Role", value: "role=menu with role=menuitem" },
            { label: "Keyboard", value: "↑/↓ navigate, Enter select, Escape close" },
            {
              label: "Placement",
              value: "Viewport boundary detection prevents clipping",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ContextMenuPage.displayName = "ContextMenuPage";
