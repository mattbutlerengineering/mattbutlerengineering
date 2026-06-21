import { DataList, NavigationMenu, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function NavigationMenuPage() {
  return (
    <ComponentPageLayout
      name="Navigation Menu"
      description="Horizontal navigation with hover-triggered dropdowns. 200ms open delay and 150ms close delay allow the mouse to travel between trigger and panel."
    >
      {/* ── Basic ─────────────────────────────────────────────────── */}
      <Section title="Basic">
        <NavigationMenu
          items={[
            { label: "Dashboard", href: "#" },
            {
              label: "Telemetry",
              children: [{ label: "Live Data" }, { label: "Historical" }, { label: "Exports" }],
            },
            {
              label: "Configuration",
              children: [{ label: "Driving Mode" }, { label: "Suspension" }, { label: "Aero" }],
            },
            { label: "About", href: "#" },
          ]}
        />
      </Section>

      {/* ── Rich Dropdowns ────────────────────────────────────────── */}
      <Section title="With Grouped Dropdowns">
        <NavigationMenu
          items={[
            { label: "Home", href: "#" },
            {
              label: "Components",
              children: [
                { label: "Button" },
                { label: "Input" },
                { label: "Select" },
                { label: "Toggle" },
              ],
            },
            {
              label: "Resources",
              children: [
                { label: "Documentation" },
                { label: "Design Tokens" },
                { label: "Changelog" },
              ],
            },
            { label: "GitHub", href: "#" },
          ]}
        />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <div
          style={{
            background: "var(--rialto-surface-elevated)",
            borderRadius: "var(--rialto-radius-soft)",
            border: "1px solid var(--rialto-border)",
            padding: "var(--rialto-space-md) var(--rialto-space-lg)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontWeight: "var(--rialto-weight-medium)",
              fontSize: "var(--rialto-text-md)",
              color: "var(--rialto-text-primary)",
            }}
          >
            Rialto
          </Text>
          <NavigationMenu
            items={[
              { label: "Overview", href: "#" },
              {
                label: "Components",
                children: [
                  { label: "Forms" },
                  { label: "Data Display" },
                  { label: "Navigation" },
                  { label: "Feedback" },
                ],
              },
              { label: "Tokens", href: "#" },
            ]}
          />
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="NavigationMenu" />
      </Section>

      {/* ── NavItem Shape ─────────────────────────────────────────── */}
      <Section title="NavItem Shape">
        <PropsTable component="NavItem" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=navigation with role=menubar" },
            { label: "Trigger", value: "aria-haspopup=true, aria-expanded on dropdown triggers" },
            { label: "Keyboard", value: "Enter/Space opens dropdown; Arrow Down moves into panel" },
            { label: "Keyboard", value: "Escape closes dropdown and returns focus to trigger" },
            {
              label: "Delay",
              value: "200ms open delay prevents accidental trigger on mouse pass-over",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

NavigationMenuPage.displayName = "NavigationMenuPage";
