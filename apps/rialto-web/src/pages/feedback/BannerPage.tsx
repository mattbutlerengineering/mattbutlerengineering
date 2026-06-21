import { Banner, Button, DataList, Stack } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BannerPage() {
  return (
    <ComponentPageLayout
      name="Banner"
      description="Full-width persistent notification strip — the page-level counterpart to Alert. Variant-coded left border with gradient tint. Optional dismiss and action slot."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.stack}>
          <Banner variant="info">Firmware v4.2.1 is available. No downtime required.</Banner>
          <Banner variant="info">
            All systems operational. Telemetry streaming at full bandwidth.
          </Banner>
          <Banner variant="warning">
            Scheduled maintenance tonight 22:00–23:00. Some features may be unavailable.
          </Banner>
          <Banner variant="error" dismissible>
            Front brake temperature sensor is not responding. Service required.
          </Banner>
          <Banner variant="accent">
            Launch control armed — standing start sequence initiated.
          </Banner>
        </div>
      </Section>

      {/* ── With Action ───────────────────────────────────────────── */}
      <Section title="With Action">
        <div className={styles.stack}>
          <Banner
            variant="warning"
            action={
              <Button variant="secondary" size="sm">
                Review
              </Button>
            }
          >
            Tire pressure below recommended threshold on rear left.
          </Banner>
          <Banner
            variant="info"
            action={
              <Button variant="secondary" size="sm">
                Update Now
              </Button>
            }
            dismissible
          >
            Firmware v4.2.1 is ready to install.
          </Banner>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <Stack gap="xs">
            <Banner
              variant="accent"
              action={
                <Button variant="secondary" size="sm">
                  View Event
                </Button>
              }
            >
              Race weekend — Round 6 registration closes in 48 hours.
            </Banner>
            <div
              style={{
                padding: "var(--rialto-space-lg)",
                background: "var(--rialto-surface-elevated)",
                borderRadius: "var(--rialto-radius-soft)",
                border: "1px solid var(--rialto-border)",
                minHeight: 80,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Button variant="ghost" size="sm">
                Page content below banner
              </Button>
            </div>
          </Stack>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Banner" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=banner for page-level, role=alert for urgent messages" },
            { label: "Placement", value: "Typically placed at the top of the page content area" },
            { label: "Dismiss", value: "Dismiss button has aria-label='Dismiss banner'" },
            { label: "Color", value: "Color is supplemental — text conveys the message meaning" },
            {
              label: "Screen reader",
              value:
                "Announced via role=status as a live region; content read when banner appears; dismiss button announced with 'close' label",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

BannerPage.displayName = "BannerPage";
