import { Button, DataList, Select, Stack, Tooltip } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Placement = "top" | "bottom" | "left" | "right";

export function TooltipPage() {
  const [placement, setPlacement] = useState<Placement>("top");

  return (
    <ComponentPageLayout
      name="Tooltip"
      description="Glass surface floating labels. Precision easing entrance with a subtle scale — appears from the direction it points. Hover or focus the buttons below."
    >
      {/* ── Placements ────────────────────────────────────────────── */}
      <Section title="Placements">
        <div className={styles.row}>
          <Tooltip content="Top placement" placement="top">
            <Button variant="secondary" size="sm">
              Top
            </Button>
          </Tooltip>
          <Tooltip content="Bottom placement" placement="bottom">
            <Button variant="secondary" size="sm">
              Bottom
            </Button>
          </Tooltip>
          <Tooltip content="Left placement" placement="left">
            <Button variant="secondary" size="sm">
              Left
            </Button>
          </Tooltip>
          <Tooltip content="Right placement" placement="right">
            <Button variant="secondary" size="sm">
              Right
            </Button>
          </Tooltip>
        </div>
      </Section>

      {/* ── Long Content ──────────────────────────────────────────── */}
      <Section title="Long Content">
        <div className={styles.row}>
          <Tooltip
            content="Confirm configuration and apply the selected driving mode to all vehicle systems"
            placement="top"
          >
            <Button variant="primary" size="sm">
              Hover for details
            </Button>
          </Tooltip>
        </div>
      </Section>

      {/* ── On Disabled Elements ──────────────────────────────────── */}
      <Section title="With Icon Trigger">
        <div className={styles.row}>
          <Tooltip content="Upload telemetry" placement="top">
            <button
              type="button"
              aria-label="Upload"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "var(--rialto-radius-default)",
                border: "1px solid var(--rialto-border)",
                background: "var(--rialto-surface-elevated)",
                cursor: "pointer",
                color: "var(--rialto-text-secondary)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8 11V3M5 6l3-3 3 3M2 13h12" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content="Download session data" placement="top">
            <button
              type="button"
              aria-label="Download"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "var(--rialto-radius-default)",
                border: "1px solid var(--rialto-border)",
                background: "var(--rialto-surface-elevated)",
                cursor: "pointer",
                color: "var(--rialto-text-secondary)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M8 3v8M5 8l3 3 3-3M2 13h12" />
              </svg>
            </button>
          </Tooltip>
          <Tooltip content="Delete permanently — cannot be undone" placement="top">
            <button
              type="button"
              aria-label="Delete"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "var(--rialto-radius-default)",
                border: "1px solid var(--rialto-border)",
                background: "var(--rialto-surface-elevated)",
                cursor: "pointer",
                color: "var(--rialto-error)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M3 4h10M6 4V3h4v1M5 4l1 9h4l1-9" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────── */}
      <Section title="Interactive Playground">
        <Stack gap="md">
          <Select
            label="Placement"
            value={placement}
            onChange={(v) => setPlacement(v as Placement)}
            options={[
              { value: "top", label: "top" },
              { value: "bottom", label: "bottom" },
              { value: "left", label: "left" },
              { value: "right", label: "right" },
            ]}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "var(--rialto-space-xl)",
            }}
          >
            <Tooltip content={`Placement: ${placement}`} placement={placement}>
              <Button variant="secondary">Hover me</Button>
            </Tooltip>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "content",
              type: "ReactNode",
              description: "Tooltip label content.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "The trigger element.",
            },
            {
              name: "placement",
              type: '"top" | "bottom" | "left" | "right"',
              default: '"top"',
              description: "Preferred placement relative to the trigger.",
            },
            {
              name: "delay",
              type: "number",
              default: "300",
              description: "Open delay in milliseconds.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=tooltip on the floating element" },
            { label: "Trigger", value: "aria-describedby links trigger to tooltip" },
            { label: "Keyboard", value: "Opens on focus, closes on blur or Escape" },
            { label: "Motion", value: "Scale animation respects prefers-reduced-motion" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TooltipPage.displayName = "TooltipPage";
