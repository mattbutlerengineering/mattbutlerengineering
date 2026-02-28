import { Button, DataList, Input, Popover, Stack } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PopoverPage() {
  return (
    <ComponentPageLayout
      name="Popover"
      description="Click-triggered floating content panels — richer than Tooltip, lighter than Dialog. Glass surface with spring entrance. Click outside or press Escape to dismiss."
    >
      {/* ── Placements ────────────────────────────────────────────── */}
      <Section title="Placements">
        <div className={styles.row}>
          <Popover
            trigger={
              <Button variant="secondary" size="sm">
                Bottom (default)
              </Button>
            }
            title="Telemetry Info"
          >
            <p style={{ margin: 0, fontSize: "var(--rialto-text-sm)", color: "var(--rialto-text-secondary)" }}>
              Current session: Fiorano, Lap 14. Ambient temperature 22°C, track temperature 38°C.
            </p>
          </Popover>
          <Popover
            trigger={
              <Button variant="secondary" size="sm">
                Top
              </Button>
            }
            title="Tire Pressure"
            placement="top"
          >
            <p style={{ marginBottom: "var(--rialto-space-xs)", fontSize: "var(--rialto-text-sm)", color: "var(--rialto-text-secondary)" }}>
              FL: 32.1 PSI &middot; FR: 31.8 PSI
            </p>
            <p style={{ margin: 0, fontSize: "var(--rialto-text-sm)", color: "var(--rialto-text-secondary)" }}>
              RL: 28.4 PSI &middot; RR: 31.2 PSI
            </p>
          </Popover>
        </div>
      </Section>

      {/* ── With Actions ──────────────────────────────────────────── */}
      <Section title="With Actions">
        <div className={styles.row}>
          <Popover
            trigger={
              <Button variant="secondary" size="sm">
                Export Data
              </Button>
            }
            title="Session Export"
          >
            <p style={{ marginBottom: "var(--rialto-space-sm)", fontSize: "var(--rialto-text-sm)", color: "var(--rialto-text-secondary)" }}>
              Export the current telemetry session data for offline analysis.
            </p>
            <div style={{ display: "flex", gap: "var(--rialto-space-xs)" }}>
              <Button variant="primary" size="sm">
                Export CSV
              </Button>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </div>
          </Popover>
        </div>
      </Section>

      {/* ── With Form ─────────────────────────────────────────────── */}
      <Section title="With Form Content">
        <div className={styles.row}>
          <Popover
            trigger={
              <Button variant="secondary" size="sm">
                Quick Edit
              </Button>
            }
            title="Session Name"
          >
            <Stack gap="sm">
              <Input placeholder="FP1 — Fiorano" />
              <div style={{ display: "flex", gap: "var(--rialto-space-xs)", justifyContent: "flex-end" }}>
                <Button variant="primary" size="sm">
                  Save
                </Button>
              </div>
            </Stack>
          </Popover>
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "trigger",
              type: "ReactNode",
              description: "The element that triggers the popover on click.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Popover body content.",
            },
            {
              name: "title",
              type: "string",
              description: "Optional heading inside the popover.",
            },
            {
              name: "placement",
              type: '"top" | "bottom" | "left" | "right"',
              default: '"bottom"',
              description: "Preferred placement relative to trigger.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=dialog on the floating panel" },
            { label: "Trigger", value: "aria-haspopup=dialog, aria-expanded on trigger" },
            { label: "Close", value: "Escape key and click-outside dismiss" },
            { label: "Focus", value: "Focus moves into popover on open" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

PopoverPage.displayName = "PopoverPage";
