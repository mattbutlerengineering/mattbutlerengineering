import { Alert, Button, DataList, Stack } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AlertPage() {
  return (
    <ComponentPageLayout
      name="Alert"
      description="Persistent inline notifications — the static counterpart to Toast. Variant-coded left accent with a subtle gradient tint. Optional dismiss, optional action slot."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.stack}>
          <Alert variant="info" title="System update available">
            Firmware v4.2.1 is ready to install. No downtime required.
          </Alert>
          <Alert variant="success" title="Telemetry sync complete">
            All 847 data points uploaded successfully.
          </Alert>
          <Alert variant="warning" title="Tire pressure low">
            Rear left tire is at 28 PSI — recommended minimum is 32 PSI.
          </Alert>
          <Alert variant="error" title="Sensor fault">
            Front brake temperature sensor is not responding. Service required before next session.
          </Alert>
        </div>
      </Section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <Section title="Features">
        <div className={styles.stack}>
          <Alert variant="info" title="Dismissible alert" dismissible>
            This alert can be closed with the dismiss button.
          </Alert>
          <Alert
            variant="warning"
            title="With action"
            actions={
              <Button variant="secondary" size="sm">
                View Details
              </Button>
            }
          >
            Adaptive suspension calibration may need adjustment for current track conditions.
          </Alert>
          <Alert variant="info" title="No body text">
            {""}
          </Alert>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <Alert variant="warning" title="Incomplete configuration">
            You have unsaved changes to your session setup. Apply them before starting.
          </Alert>
          <Alert
            variant="success"
            title="Session saved"
            actions={
              <Button variant="ghost" size="sm">
                View Session
              </Button>
            }
            dismissible
          >
            FP1 data has been saved to your account.
          </Alert>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"info" | "success" | "warning" | "error"',
              default: '"info"',
              description: "Color and icon variant.",
            },
            {
              name: "title",
              type: "string",
              description: "Bold heading text.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Body content below the title.",
            },
            {
              name: "dismissible",
              type: "boolean",
              default: "false",
              description: "Shows a dismiss button to hide the alert.",
            },
            {
              name: "actions",
              type: "ReactNode",
              description: "Optional action buttons rendered below the body.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=alert for error/warning, role=status for info/success" },
            {
              label: "Live region",
              value: "aria-live=polite on status, aria-live=assertive on alert",
            },
            { label: "Dismiss", value: "Dismiss button has aria-label='Dismiss'" },
            { label: "Icon", value: "Status icon is aria-hidden (decorative)" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

AlertPage.displayName = "AlertPage";
