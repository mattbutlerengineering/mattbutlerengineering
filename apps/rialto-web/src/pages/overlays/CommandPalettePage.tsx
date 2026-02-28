import { Button, CommandPalette, DataList, Stack, useToast } from "@mbe/rialto";
import type { CommandItem } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const CMD_ITEMS: CommandItem[] = [
  {
    id: "toggle-mode",
    label: "Toggle Driving Mode",
    group: "Actions",
    shortcut: ["⌘", "D"],
  },
  {
    id: "save-config",
    label: "Save Configuration",
    group: "Actions",
    shortcut: ["⌘", "S"],
  },
  {
    id: "launch-control",
    label: "Arm Launch Control",
    group: "Actions",
  },
  {
    id: "reset-telemetry",
    label: "Reset Telemetry",
    group: "Actions",
  },
  {
    id: "lap-data",
    label: "View Lap Data",
    group: "Navigation",
    shortcut: ["⌘", "L"],
  },
  {
    id: "settings",
    label: "Open Settings",
    group: "Navigation",
    shortcut: ["⌘", ","],
  },
  { id: "pit-wall", label: "Pit Wall Dashboard", group: "Navigation" },
  { id: "garage", label: "Garage View", group: "Navigation" },
  {
    id: "theme-light",
    label: "Switch to Light Theme",
    group: "Preferences",
  },
  { id: "theme-dark", label: "Switch to Dark Theme", group: "Preferences" },
  {
    id: "reduce-motion",
    label: "Toggle Reduced Motion",
    group: "Preferences",
  },
];

export function CommandPalettePage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const itemsWithActions: CommandItem[] = CMD_ITEMS.map((item) => ({
    ...item,
    onSelect: item.onSelect ?? (() => toast({ title: item.label })),
  }));

  return (
    <ComponentPageLayout
      name="Command Palette"
      description="⌘K-style action launcher — glass panel, fuzzy search, full keyboard navigation. Grouped commands with shortcut hints. The power-user pattern, built for AI-ready interfaces."
    >
      {/* ── Demo ──────────────────────────────────────────────────── */}
      <Section title="Demo">
        <div className={styles.row}>
          <Button onClick={() => setOpen(true)}>Open Command Palette</Button>
        </div>

        <CommandPalette
          open={open}
          onOpenChange={setOpen}
          items={itemsWithActions}
          placeholder="Search commands..."
          groups={["Actions", "Navigation", "Preferences"]}
        />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Keyboard Shortcut Pattern">
        <Stack gap="sm">
          <div
            style={{
              padding: "var(--rialto-space-md)",
              background: "var(--rialto-surface-recessed)",
              borderRadius: "var(--rialto-radius-default)",
              fontFamily: "var(--rialto-font-mono)",
              fontSize: "var(--rialto-text-xs)",
              color: "var(--rialto-text-secondary)",
            }}
          >
            <pre style={{ margin: 0 }}>
              {`// Register ⌘K globally
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setOpen(true);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);`}
            </pre>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "open",
              type: "boolean",
              description: "Controls palette visibility.",
            },
            {
              name: "onOpenChange",
              type: "(open: boolean) => void",
              description: "Called when palette open state changes.",
            },
            {
              name: "items",
              type: "CommandItem[]",
              description: "Array of command items to display and search.",
            },
            {
              name: "placeholder",
              type: "string",
              default: '"Search commands..."',
              description: "Search input placeholder text.",
            },
            {
              name: "groups",
              type: "string[]",
              description: "Group names to organize items. Items are rendered in group order.",
            },
          ]}
        />
      </Section>

      {/* ── CommandItem Type ──────────────────────────────────────── */}
      <Section title="CommandItem Type">
        <PropsTable
          props={[
            {
              name: "id",
              type: "string",
              description: "Unique identifier for the item.",
            },
            {
              name: "label",
              type: "string",
              description: "Display text and search target.",
            },
            {
              name: "group",
              type: "string",
              description: "Group name this item belongs to.",
            },
            {
              name: "shortcut",
              type: "string[]",
              description: "Array of key labels shown as hints (e.g. ['⌘', 'K']).",
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
            { label: "Role", value: "combobox pattern with role=option on items" },
            { label: "Keyboard", value: "↑/↓ to navigate, Enter to select, Escape to close" },
            { label: "Search", value: "Fuzzy match across label text" },
            { label: "Focus", value: "Focus trapped inside palette while open" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

CommandPalettePage.displayName = "CommandPalettePage";
