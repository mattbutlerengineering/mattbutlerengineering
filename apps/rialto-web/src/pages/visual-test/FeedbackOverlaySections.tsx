import {
  Breadcrumb,
  Dialog,
  Drawer,
  EmptyState,
  Meter,
  Pagination,
  Progress,
  Skeleton,
  SkeletonGroup,
  Stat,
  Steps,
  Text,
  Tooltip,
  Button,
} from "@mattbutlerengineering/rialto";
import { Section } from "./Section";
import styles from "./VisualTest.module.css";

/**
 * Sections of the Visual Test Harness between DataList and TapeChart:
 * Progress, Meter, Skeleton, Steps, Breadcrumb, EmptyState, Stat, Tooltip,
 * Pagination, Dialog, Drawer.
 */
export function FeedbackOverlaySections() {
  return (
    <>
      {/* ── Progress ───────────────────────── */}
      <Section id="progress-states" title="Progress — States">
        <div className={styles.cardColumn}>
          <Progress value={65} />
          <Progress />
        </div>
      </Section>

      {/* ── Meter ──────────────────────────── */}
      <Section id="meter-variants" title="Meter — Variants">
        <div className={styles.cardColumn}>
          <Meter label="Storage" value={72} showValue />
          <Meter label="CPU" value={45} variant="accent" showValue />
          <Meter label="Health" value={90} variant="success" showValue />
          <Meter label="Errors" value={15} variant="error" showValue />
        </div>
      </Section>

      {/* ── Skeleton ─────────────────────────── */}
      <Section id="skeleton-variants" title="Skeleton — Variants">
        <div className={styles.cardColumn}>
          <SkeletonGroup>
            <Skeleton variant="circle" width={48} height={48} />
            <Skeleton variant="heading" width="60%" />
            <Skeleton variant="text" lines={3} width="100%" />
          </SkeletonGroup>
        </div>
      </Section>

      {/* ── Steps ──────────────────────────── */}
      <Section id="steps-default" title="Steps">
        <div className={styles.cardColumn}>
          <Steps
            steps={[
              { label: "Cart", description: "Review items" },
              { label: "Shipping", description: "Enter address" },
              { label: "Payment", description: "Add billing" },
              { label: "Confirm", description: "Place order" },
            ]}
            currentStep={1}
          />
        </div>
      </Section>

      {/* ── Breadcrumb ─────────────────────── */}
      <Section id="breadcrumb-default" title="Breadcrumb">
        <div className={styles.card}>
          <Breadcrumb
            items={[
              { label: "Home", href: "#" },
              { label: "Products", href: "#" },
              { label: "Electronics", href: "#" },
              { label: "Headphones" },
            ]}
          />
        </div>
      </Section>

      {/* ── EmptyState ─────────────────────── */}
      <Section id="emptystate-default" title="EmptyState">
        <div className={styles.card}>
          <EmptyState
            icon="search"
            title="No results found"
            description="Try adjusting your search or filters."
          />
        </div>
      </Section>

      {/* ── Stat ───────────────────────────── */}
      <Section id="stat-variants" title="Stat — Trends">
        <div className={styles.card}>
          <Stat label="Revenue" value="$12,400" delta="+8.2%" trend="up" />
          <Stat label="Churn" value="2.4%" delta="-0.3%" trend="down" />
          <Stat label="Users" value="1,024" delta="0%" trend="neutral" />
        </div>
      </Section>

      {/* ── Tooltip ────────────────────────── */}
      <Section id="tooltip-default" title="Tooltip">
        <div className={styles.card}>
          <Tooltip content="Helpful tooltip text">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
        </div>
      </Section>

      {/* ── Pagination ─────────────────────── */}
      <Section id="pagination-default" title="Pagination">
        <div className={styles.card}>
          <Pagination page={3} totalPages={10} onChange={() => {}} />
        </div>
      </Section>

      {/* ── Dialog ─────────────────────────── */}
      <Section id="dialog-open" title="Dialog — Open">
        <div className={styles.cardColumn} style={{ position: "relative", minHeight: 200 }}>
          <Dialog
            open
            onClose={() => {}}
            title="Confirm Action"
            description="Are you sure you want to proceed?"
          >
            <Text>This action cannot be undone.</Text>
          </Dialog>
        </div>
      </Section>

      {/* ── Drawer ─────────────────────────── */}
      <Section id="drawer-open" title="Drawer — Open">
        <div className={styles.cardColumn} style={{ position: "relative", minHeight: 200 }}>
          <Drawer open onClose={() => {}} title="Settings" description="Manage your preferences">
            <Text>Drawer content goes here.</Text>
          </Drawer>
        </div>
      </Section>
    </>
  );
}
