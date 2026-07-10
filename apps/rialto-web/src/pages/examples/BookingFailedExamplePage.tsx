import { Badge, Button, Card, DataList, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./BookingFailedExamplePage.module.css";

/* ── Fixture data (no service calls) ─────────── */

/** What the failed attempt tried to do — enough for the guest to decide their next move. */
export const FAILURE_DETAILS: { label: string; value: string }[] = [
  { label: "Reason", value: "Card declined" },
  { label: "Attempted", value: "The Ledger Hotel · Suite 402" },
  { label: "Dates", value: "Mar 23 – Mar 26, 2026" },
  { label: "Amount", value: "$1,650 — not charged" },
];

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with component below

const FAILED_EXAMPLE_JSX = `<div className={styles.result}>
  <div className={styles.statusRegion} role="alert">
    <div className={styles.medallion} aria-hidden="true">
      {/* decorative cross glyph */}
    </div>
    <Badge variant="error" dot>
      Payment declined
    </Badge>
  </div>
  <Text variant="display" as="h2">
    We couldn\u2019t confirm your booking
  </Text>
  <Text variant="body" color="secondary" className={styles.copy}>
    Your card was declined, so we haven\u2019t charged you and the booking wasn\u2019t
    placed. Nothing was lost \u2014 try again, or reach out and we\u2019ll help you finish.
  </Text>
  <Card className={styles.summary}>
    <Text variant="label" as="h3" className={styles.summaryTitle}>
      What happened
    </Text>
    <DataList items={FAILURE_DETAILS} orientation="horizontal" striped />
  </Card>
  <div className={styles.actions}>
    <Button variant="primary">Try payment again</Button>
    <Button variant="secondary">Contact support</Button>
    <Button variant="ghost">Back to dashboard</Button>
  </div>
</div>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      The copy names what went wrong in plain language and immediately answers the anxious question
      — “was I charged?” — without blaming the user or leaking gateway internals. The status lives
      in a <code>role=&quot;alert&quot;</code> region so assistive tech announces the failure the
      moment the page loads.
    </CompositionNote>
    <CompositionNote>
      Because a declined payment is usually transient, the primary CTA retries in place rather than
      dumping the user elsewhere and losing the half-finished booking. A secondary “Contact support”
      is the human escape hatch, and the ghost dashboard link is the low-emphasis way out.
    </CompositionNote>
    <CompositionNote>
      The error tint, spacing, and medallion all read from Rialto tokens, so the page inherits light
      and dark themes with no per-page overrides — and unlike the success screen it stays static, so
      a failure never animates.
    </CompositionNote>
  </Stack>
);

/* ── Component ───────────────────────────────── */

export function BookingFailedExamplePage() {
  return (
    <ExamplePageLayout
      name="Booking Failed"
      description="Failure result page with a retry CTA and a support escape hatch"
      sourceJsx={FAILED_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.result}>
        <div className={styles.statusRegion} role="alert">
          <div className={styles.medallion} aria-hidden="true">
            <svg
              className={styles.glyph}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </div>
          <Badge variant="error" dot>
            Payment declined
          </Badge>
        </div>
        <Text variant="display" as="h2">
          We couldn’t confirm your booking
        </Text>
        <Text variant="body" color="secondary" className={styles.copy}>
          Your card was declined, so we haven’t charged you and the booking wasn’t placed. Nothing
          was lost — try again, or reach out and we’ll help you finish.
        </Text>
        <Card className={styles.summary}>
          <Text variant="label" as="h3" className={styles.summaryTitle}>
            What happened
          </Text>
          <DataList items={FAILURE_DETAILS} orientation="horizontal" striped />
        </Card>
        <div className={styles.actions}>
          <Button variant="primary">Try payment again</Button>
          <Button variant="secondary">Contact support</Button>
          <Button variant="ghost">Back to dashboard</Button>
        </div>
      </div>
    </ExamplePageLayout>
  );
}

BookingFailedExamplePage.displayName = "BookingFailedExamplePage";
