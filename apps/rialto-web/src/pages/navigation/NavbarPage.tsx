import { Button, DataList, Navbar, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function NavbarPage() {
  return (
    <ComponentPageLayout
      name="Navbar"
      description="Full-featured left navbar with header, search, user section, and navigation links. Supports nested links with expand/collapse. Best for app layouts requiring persistent navigation with user context."
    >
      {/* ── Full Navbar ───────────────────────────────────────────── */}
      <Section title="Full Navbar (Contained)">
        <div
          style={{
            height: 420,
            overflow: "hidden",
            position: "relative",
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-soft)",
          }}
        >
          <Navbar
            logo={<Text style={{ fontWeight: "var(--rialto-weight-medium)" }}>Rialto</Text>}
            search={{ placeholder: "Search..." }}
            user={{
              name: "Alex Morgan",
              email: "alex@company.com",
            }}
            links={[
              {
                id: "dashboard",
                label: "Dashboard",
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <rect x="2" y="2" width="5" height="5" rx="1" />
                    <rect x="9" y="2" width="5" height="5" rx="1" />
                    <rect x="2" y="9" width="5" height="5" rx="1" />
                    <rect x="9" y="9" width="5" height="5" rx="1" />
                  </svg>
                ),
              },
              {
                id: "analytics",
                label: "Analytics",
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M2 14V8M6 14V4M10 14V10M14 14V2" />
                  </svg>
                ),
              },
              {
                id: "customers",
                label: "Customers",
                badge: 12,
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="8" cy="5" r="3" />
                    <path d="M2 14c0-3 2-5 6-5s6 2 6 5" />
                  </svg>
                ),
              },
              {
                id: "settings",
                label: "Settings",
                icon: (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <circle cx="8" cy="8" r="2" />
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1" />
                  </svg>
                ),
                children: [
                  { id: "profile", label: "Profile", href: "#" },
                  { id: "account", label: "Account", href: "#" },
                  { id: "security", label: "Security", href: "#" },
                ],
              },
            ]}
            footer={
              <Button variant="ghost" size="sm">
                Sign Out
              </Button>
            }
          />
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Navbar" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<nav aria-label='Main navigation'>" },
            { label: "Active", value: "aria-current='page' on active link" },
            { label: "Expandable", value: "aria-expanded on links with children" },
            { label: "Badge", value: "Badge counts announced via aria-label" },
            { label: "Keyboard", value: "Tab navigation through links; Enter to activate" },
            {
              label: "Screen reader",
              value:
                "Announced as navigation landmark; links announced with their labels; current page indicated by aria-current=page",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

NavbarPage.displayName = "NavbarPage";
