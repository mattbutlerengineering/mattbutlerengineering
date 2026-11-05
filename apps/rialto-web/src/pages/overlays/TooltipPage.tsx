import { useState, type ReactNode } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import {
  Button,
  DataList,
  IconButton,
  Select,
  Stack,
  Tooltip,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Placement = "top" | "bottom" | "left" | "right";

/**
 * IconButton, not a padded Button squeezed to 32px. Button's horizontal
 * padding is 16px each side, so a 32px box has no content width, and the
 * reset's `svg { max-width: 100% }` scales the stroke to nothing.
 */
function IconTrigger({
  label,
  content,
  icon,
  color,
}: {
  label: string;
  content: string;
  icon: ReactNode;
  color?: string;
}) {
  return (
    <Tooltip content={content} placement="top">
      <IconButton
        variant="secondary"
        size="sm"
        aria-label={label}
        icon={icon}
        style={color ? { color } : undefined}
      />
    </Tooltip>
  );
}

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

      {/* ── With Icon Trigger ────────────────────────────────────── */}
      <Section title="With Icon Trigger">
        <div className={styles.row}>
          <IconTrigger label="Upload" content="Upload telemetry" icon={<Upload size={16} />} />
          <IconTrigger
            label="Download"
            content="Download session data"
            icon={<Download size={16} />}
          />
          <IconTrigger
            label="Delete"
            content="Delete permanently — cannot be undone"
            icon={<Trash2 size={16} />}
            color="var(--rialto-error)"
          />
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
        <PropsTable component="Tooltip" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=tooltip on the floating element" },
            { label: "Trigger", value: "aria-describedby links trigger to tooltip" },
            { label: "Keyboard", value: "Opens on focus, closes on blur or Escape" },
            { label: "Motion", value: "Scale animation respects prefers-reduced-motion" },
            {
              label: "Screen reader",
              value:
                "Content announced via aria-describedby when trigger receives focus; tooltip text read after trigger label; no focus movement into tooltip",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TooltipPage.displayName = "TooltipPage";
