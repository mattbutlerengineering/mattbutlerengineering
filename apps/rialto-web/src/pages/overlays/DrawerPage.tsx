import {
  Button,
  DataList,
  Divider,
  Drawer,
  Input,
  Select,
  Stack,
  Text,
  Toggle,
} from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DrawerPage() {
  const [drawerRight, setDrawerRight] = useState(false);
  const [drawerLeft, setDrawerLeft] = useState(false);
  const [drawerBottom, setDrawerBottom] = useState(false);
  const [streaming, setStreaming] = useState(true);

  return (
    <ComponentPageLayout
      name="Drawer"
      description="Slide-out panels from any screen edge — glass surface with spring physics entrance. The contextual counterpart to Dialog: augments rather than interrupts."
    >
      {/* ── Sides ─────────────────────────────────────────────────── */}
      <Section title="Sides">
        <div className={styles.row}>
          <Button variant="secondary" size="sm" onClick={() => setDrawerRight(true)}>
            Right (default)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDrawerLeft(true)}>
            Left
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDrawerBottom(true)}>
            Bottom
          </Button>
        </div>

        {/* Right Drawer */}
        <Drawer
          open={drawerRight}
          onClose={() => setDrawerRight(false)}
          title="Session Settings"
          description="Configure telemetry and driving parameters for the current session."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDrawerRight(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDrawerRight(false)}>
                Apply
              </Button>
            </>
          }
        >
          <Stack gap="md">
            <Input label="Session Name" placeholder="FP1 — Fiorano" />
            <Select
              label="Tire Compound"
              placeholder="Select compound..."
              value=""
              onChange={() => {}}
              options={[
                { value: "soft", label: "Soft (C5)" },
                { value: "medium", label: "Medium (C3)" },
                { value: "hard", label: "Hard (C1)" },
              ]}
            />
            <Toggle
              label="Live telemetry streaming"
              checked={streaming}
              onCheckedChange={setStreaming}
            />
          </Stack>
        </Drawer>

        {/* Left Drawer */}
        <Drawer
          open={drawerLeft}
          onClose={() => setDrawerLeft(false)}
          side="left"
          title="Navigation"
        >
          <nav>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-xs)" }}
            >
              {[
                { label: "Dashboard", active: true },
                { label: "Telemetry" },
                { label: "Lap Analysis" },
                { label: "Setup Sheets" },
                { label: "Tire Strategy" },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setDrawerLeft(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "var(--rialto-space-xs) var(--rialto-space-sm)",
                    borderRadius: "var(--rialto-radius-default)",
                    border: "none",
                    background: item.active ? "var(--rialto-accent-muted)" : "transparent",
                    color: item.active
                      ? "var(--rialto-accent)"
                      : "var(--rialto-text-secondary)",
                    fontSize: "var(--rialto-text-sm)",
                    fontFamily: "var(--rialto-font-sans)",
                    fontWeight: item.active
                      ? "var(--rialto-weight-medium)"
                      : "var(--rialto-weight-regular)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {item.label}
                </button>
              ))}
              <Divider spacing="compact" />
              <button
                type="button"
                onClick={() => setDrawerLeft(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "var(--rialto-space-xs) var(--rialto-space-sm)",
                  border: "none",
                  background: "transparent",
                  color: "var(--rialto-text-tertiary)",
                  fontSize: "var(--rialto-text-xs)",
                  fontFamily: "var(--rialto-font-sans)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                Settings
              </button>
            </div>
          </nav>
        </Drawer>

        {/* Bottom Drawer */}
        <Drawer
          open={drawerBottom}
          onClose={() => setDrawerBottom(false)}
          side="bottom"
          title="Quick Actions"
          description="Bottom sheets are ideal for mobile-first interactions and contextual toolbars."
        >
          <div className={styles.row} style={{ flexWrap: "wrap" }}>
            <Button variant="secondary" size="sm" onClick={() => setDrawerBottom(false)}>
              Share
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDrawerBottom(false)}>
              Export
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDrawerBottom(false)}>
              Duplicate
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDrawerBottom(false)}>
              Cancel
            </Button>
          </div>
        </Drawer>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="When to Use">
        <Stack gap="sm">
          <Text variant="body" color="secondary">
            Use Drawer when the content <strong>augments</strong> the current view — form panels,
            detail views, filter sidebars. Use Dialog when a <strong>decision</strong> is required
            before continuing.
          </Text>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "open",
              type: "boolean",
              description: "Controls drawer visibility.",
            },
            {
              name: "onClose",
              type: "() => void",
              description: "Called when backdrop is clicked or Escape is pressed.",
            },
            {
              name: "side",
              type: '"right" | "left" | "bottom"',
              default: '"right"',
              description: "Which screen edge the drawer slides from.",
            },
            {
              name: "title",
              type: "string",
              description: "Drawer heading.",
            },
            {
              name: "description",
              type: "string",
              description: "Optional supporting text below the title.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Drawer body content.",
            },
            {
              name: "footer",
              type: "ReactNode",
              description: "Action buttons at the bottom of the drawer.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=dialog with aria-modal=true" },
            { label: "Focus", value: "Focus trapped inside drawer while open" },
            { label: "Close", value: "Escape key and backdrop click dismiss" },
            { label: "Motion", value: "Slide animation respects prefers-reduced-motion" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

DrawerPage.displayName = "DrawerPage";
