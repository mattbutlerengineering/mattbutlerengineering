import { Button, DataList, DropdownMenu, useToast } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DropdownMenuPage() {
  const { toast } = useToast();

  return (
    <ComponentPageLayout
      name="Dropdown Menu"
      description="Action menus with glass surface, keyboard navigation, section labels, shortcut hints, and destructive items. The action-oriented counterpart to Select."
    >
      {/* ── Basic ─────────────────────────────────────────────────── */}
      <Section title="Basic">
        <div className={styles.row}>
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm">
                Actions
              </Button>
            }
            items={[
              {
                id: "copy",
                label: "Copy",
                shortcut: "⌘C",
                onSelect: () => toast({ title: "Copied to clipboard" }),
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
                label: "Export Data",
                onSelect: () => toast({ title: "Exporting...", variant: "accent" }),
              },
              {
                id: "share",
                label: "Share Report",
                onSelect: () => toast({ title: "Link copied", variant: "success" }),
              },
              { id: "archive", label: "Archive", disabled: true },
              { type: "divider" },
              {
                id: "reset",
                label: "Reset to Factory",
                destructive: true,
                onSelect: () => toast({ title: "Configuration reset", variant: "error" }),
              },
            ]}
          />
        </div>
      </Section>

      {/* ── Right Aligned ─────────────────────────────────────────── */}
      <Section title="Right Aligned">
        <div className={styles.row}>
          <DropdownMenu
            trigger={
              <Button variant="secondary" size="sm">
                Right-aligned
              </Button>
            }
            align="right"
            items={[
              {
                id: "settings",
                label: "Settings",
                shortcut: "⌘,",
                onSelect: () => toast({ title: "Opening settings..." }),
              },
              {
                id: "preferences",
                label: "Preferences",
                onSelect: () => toast({ title: "Opening preferences..." }),
              },
              { type: "divider" },
              {
                id: "logout",
                label: "Sign Out",
                destructive: true,
                onSelect: () => toast({ title: "Signing out...", variant: "error" }),
              },
            ]}
          />
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <div
          style={{
            padding: "var(--rialto-space-md)",
            background: "var(--rialto-surface-elevated)",
            borderRadius: "var(--rialto-radius-soft)",
            border: "1px solid var(--rialto-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "var(--rialto-text-sm)",
                fontWeight: "var(--rialto-weight-medium)",
                color: "var(--rialto-text-primary)",
              }}
            >
              FP1 — Fiorano
            </p>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "var(--rialto-text-xs)",
                color: "var(--rialto-text-tertiary)",
              }}
            >
              Best: 1:24.892 &middot; 14 laps
            </p>
          </div>
          <DropdownMenu
            trigger={
              <Button variant="ghost" size="sm">
                &bull;&bull;&bull;
              </Button>
            }
            align="right"
            items={[
              {
                id: "view",
                label: "View Details",
                onSelect: () => toast({ title: "Opening session..." }),
              },
              {
                id: "export",
                label: "Export",
                onSelect: () => toast({ title: "Exporting CSV..." }),
              },
              { type: "divider" },
              {
                id: "delete",
                label: "Delete Session",
                destructive: true,
                onSelect: () => toast({ title: "Session deleted", variant: "error" }),
              },
            ]}
          />
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "trigger",
              type: "ReactNode",
              description: "Element that opens the menu on click.",
            },
            {
              name: "items",
              type: "Array<MenuItem | DividerItem | LabelItem>",
              description: "Menu items, dividers, and section labels.",
            },
            {
              name: "align",
              type: '"left" | "right"',
              default: '"left"',
              description: "Menu alignment relative to trigger.",
            },
          ]}
        />
      </Section>

      {/* ── MenuItem Type ─────────────────────────────────────────── */}
      <Section title="MenuItem Type">
        <PropsTable
          props={[
            {
              name: "id",
              type: "string",
              description: "Unique key.",
            },
            {
              name: "label",
              type: "string",
              description: "Display text.",
            },
            {
              name: "shortcut",
              type: "string",
              description: "Keyboard shortcut hint (display only).",
            },
            {
              name: "destructive",
              type: "boolean",
              description: "Renders item in error color.",
            },
            {
              name: "disabled",
              type: "boolean",
              description: "Grays out item and prevents selection.",
            },
            {
              name: "onSelect",
              type: "() => void",
              description: "Called when item is selected.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=menu with role=menuitem on items" },
            {
              label: "Keyboard",
              value: "↑/↓ navigate, Enter/Space select, Escape close",
            },
            { label: "Trigger", value: "aria-haspopup=menu, aria-expanded" },
            { label: "Destructive", value: "Color is supplemental — label conveys danger" },
            {
              label: "Screen reader",
              value:
                "Menu opens silently; each focused item announced by label; items with keyboard shortcuts announce the shortcut text; destructive items have no additional annotation",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

DropdownMenuPage.displayName = "DropdownMenuPage";
