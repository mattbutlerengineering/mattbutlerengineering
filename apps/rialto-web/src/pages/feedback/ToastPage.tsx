import { Button, DataList, Stack, useToast } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ToastPage() {
  const { toast } = useToast();

  return (
    <ComponentPageLayout
      name="Toast"
      description="Glass surface notifications that slide in with spring physics from the right. Auto-dismiss with a gold countdown bar. Stackable, dismissible, variant-coded."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: "Configuration saved",
                description: "Driving mode updated to Sport.",
                variant: "default",
              })
            }
          >
            Default
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: "Telemetry uploaded",
                description: "All systems nominal.",
                variant: "success",
              })
            }
          >
            Success
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: "Sensor fault detected",
                description: "Rear left tire pressure below threshold.",
                variant: "error",
              })
            }
          >
            Error
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: "Launch control armed",
                variant: "accent",
                duration: 6000,
              })
            }
          >
            Accent (6s)
          </Button>
        </div>
      </Section>

      {/* ── Without Description ───────────────────────────────────── */}
      <Section title="Title Only">
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast({ title: "Lap recorded" })}
          >
            Title only
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast({ title: "Configuration reset", variant: "error" })}
          >
            Error title only
          </Button>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              toast({
                title: "Session started",
                description: "FP1 — Fiorano Circuit. Telemetry link established.",
                variant: "success",
              })
            }
          >
            Start Session
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              toast({
                title: "Unsaved changes",
                description: "Your setup sheet has unsaved modifications.",
                variant: "default",
              })
            }
          >
            Trigger Warning
          </Button>
        </Stack>
      </Section>

      {/* ── How to Use ────────────────────────────────────────────── */}
      <Section title="Setup">
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
{`// 1. RialtoProvider already includes ToastProvider
// 2. Import and use the hook:
import { useToast } from '@mattbutlerengineering/rialto';

function MyComponent() {
  const { toast } = useToast();

  return (
    <Button onClick={() => toast({
      title: "Saved",
      variant: "success"
    })}>
      Save
    </Button>
  );
}`}
          </pre>
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Toast Options">
        <PropsTable
          props={[
            {
              name: "title",
              type: "string",
              description: "Primary notification text.",
            },
            {
              name: "description",
              type: "string",
              description: "Optional supporting text below the title.",
            },
            {
              name: "variant",
              type: '"default" | "success" | "error" | "accent"',
              default: '"default"',
              description: "Color and icon variant.",
            },
            {
              name: "duration",
              type: "number",
              default: "4000",
              description: "Auto-dismiss duration in milliseconds.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=status (default) or role=alert (error)" },
            { label: "Live region", value: "aria-live=polite announces to screen readers" },
            { label: "Dismiss", value: "Dismiss button has aria-label='Dismiss notification'" },
            { label: "Focus", value: "Focus is not moved to the toast — non-interrupting" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ToastPage.displayName = "ToastPage";
