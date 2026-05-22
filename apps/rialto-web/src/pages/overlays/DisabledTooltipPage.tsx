import { useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  DataList,
  DisabledTooltip,
  Input,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function DisabledTooltipPlayground() {
  const [disabled, setDisabled] = useState(true);
  const [showReason, setShowReason] = useState(true);

  const reason = showReason ? "Complete all required fields before submitting" : undefined;

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", textAlign: "center" }}>
        <DisabledTooltip disabled={disabled} disabledReason={reason}>
          <Button variant="primary" disabled={disabled}>
            Submit Form
          </Button>
        </DisabledTooltip>
      </Card>
      <div className={styles.row}>
        <Checkbox label="Disabled" checked={disabled} onCheckedChange={setDisabled} />
        <Checkbox label="Show Reason" checked={showReason} onCheckedChange={setShowReason} />
      </div>
      <Text variant="caption" color="secondary">
        When disabled is true and a reason is provided, hovering reveals the tooltip. When disabled
        is false, the children render as-is with no wrapper.
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DisabledTooltipPage() {
  const [formValid, setFormValid] = useState(false);

  return (
    <ComponentPageLayout
      name="DisabledTooltip"
      description="Wraps a disabled element with a Tooltip explaining why it is disabled. When the element is enabled, it renders children transparently with no overhead."
    >
      {/* ── Basic Usage ─────────────────────────────────────────────── */}
      <Section title="Basic Usage">
        <Stack gap="md">
          <div className={styles.row}>
            <DisabledTooltip
              disabled
              disabledReason="You do not have permission to delete this record"
            >
              <Button variant="secondary" disabled>
                Delete
              </Button>
            </DisabledTooltip>
            <DisabledTooltip disabled disabledReason="Session must be paused before exporting">
              <Button variant="secondary" disabled>
                Export Data
              </Button>
            </DisabledTooltip>
            <DisabledTooltip disabled disabledReason="Connect a device to enable live telemetry">
              <Button variant="primary" disabled>
                Start Live
              </Button>
            </DisabledTooltip>
          </div>
          <Text variant="caption" color="secondary">
            Hover each button to see the explanation. Tooltip is only added when both{" "}
            <code style={{ fontFamily: "var(--rialto-font-mono)" }}>disabled</code> and{" "}
            <code style={{ fontFamily: "var(--rialto-font-mono)" }}>disabledReason</code> are
            provided.
          </Text>
        </Stack>
      </Section>

      {/* ── Enabled State ────────────────────────────────────────────── */}
      <Section title="Transparent When Enabled">
        <div className={styles.row}>
          <DisabledTooltip disabled={false} disabledReason="This reason is never shown">
            <Button variant="primary">Enabled — no tooltip</Button>
          </DisabledTooltip>
          <DisabledTooltip disabled>
            <Button variant="secondary" disabled>
              Disabled, no reason — no tooltip
            </Button>
          </DisabledTooltip>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Session Configuration
            </Text>
            <Text variant="caption" color="secondary">
              Fill out all fields to enable submission.
            </Text>
            <Input label="Circuit Name" placeholder="e.g. Monza" />
            <Checkbox
              label="I confirm the session setup is correct"
              checked={formValid}
              onCheckedChange={setFormValid}
            />
            <Stack direction="row" gap="sm" align="center" justify="end" wrap>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
              <DisabledTooltip
                disabled={!formValid}
                disabledReason="Check the confirmation box to continue"
              >
                <Button variant="primary" size="sm" disabled={!formValid}>
                  Save Configuration
                </Button>
              </DisabledTooltip>
            </Stack>
          </Stack>
        </Card>
      </Section>

      {/* ── Interactive Playground ────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <DisabledTooltipPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "When true (and disabledReason is set), wraps children with a Tooltip.",
            },
            {
              name: "disabledReason",
              type: "string",
              description: "Tooltip content explaining why the element is disabled.",
            },
            {
              name: "children",
              type: "ReactNode",
              description:
                "The element to wrap. Should also have the disabled prop set when disabled=true.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Pattern",
              value: "Composes Tooltip — inherits all Tooltip accessibility including role=tooltip",
            },
            {
              label: "Focus",
              value:
                "showOnFocus=false by default — disabled elements cannot receive focus, so the tooltip is hover-only",
            },
            {
              label: "Disabled Element",
              value:
                "Ensure the child element has disabled or aria-disabled set so screen readers announce it correctly",
            },
            {
              label: "Transparency",
              value:
                "When not disabled, renders a React fragment — zero DOM overhead, no wrapping element",
            },
            {
              label: "Screen reader",
              value:
                "Tooltip announced via aria-describedby on focus of the disabled wrapper element; explains why the control is disabled",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

DisabledTooltipPage.displayName = "DisabledTooltipPage";
