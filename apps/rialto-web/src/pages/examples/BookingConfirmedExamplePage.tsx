import { Badge, Button, Card, DataList, Stack, Text } from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import styles from "./BookingConfirmedExamplePage.module.css";

/* ── Fixture data (no service calls) ─────────── */

/** The reservation the confirmation summarises — the same booking the wizard would create. */
export const BOOKING_SUMMARY: { label: string; value: string }[] = [
  { label: "Confirmation", value: "RES-4821" },
  { label: "Property", value: "The Ledger Hotel" },
  { label: "Room", value: "Suite 402 · Rooftop Terrace" },
  { label: "Dates", value: "Mar 23 – Mar 26, 2026" },
  { label: "Party", value: "2 guests" },
  { label: "Total", value: "$1,650" },
];

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with component below

const CONFIRMED_EXAMPLE_JSX = `<div className={styles.result}>
  <div className={styles.statusRegion} role="status">
    <div className={styles.medallion} aria-hidden="true">
      {/* decorative check glyph */}
    </div>
    <Badge variant="success" dot>
      Confirmed
    </Badge>
  </div>
  <Text variant="display" as="h2">
    Your reservation is confirmed
  </Text>
  <Text variant="body" color="secondary" className={styles.copy}>
    We\u2019ve emailed your confirmation and the details are below. Add it to your
    calendar so you don\u2019t miss check-in.
  </Text>
  <Card className={styles.summary}>
    <Text variant="label" as="h3" className={styles.summaryTitle}>
      Reservation summary
    </Text>
    <DataList items={BOOKING_SUMMARY} orientation="horizontal" striped />
  </Card>
  <div className={styles.actions}>
    <Button variant="primary">View reservation</Button>
    <Button variant="secondary">Add to calendar</Button>
    <Button variant="ghost">Back to dashboard</Button>
  </div>
</div>`;

/* ── Composition notes ───────────────────────── */

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      The outcome is stated three ways — a success-tinted medallion, a “Confirmed” badge, and a
      plain-language heading — so it lands whether someone is scanning, reading, or listening with a
      screen reader. The status sits in a <code>role=&quot;status&quot;</code> region so assistive
      tech announces the result on arrival.
    </CompositionNote>
    <CompositionNote>
      The summary answers “what did I just book?” without a round-trip: a DataList of the created
      reservation. Every next step is offered — the primary CTA opens the booking, while calendar
      and dashboard actions stay lower-emphasis so the happy path reads first.
    </CompositionNote>
    <CompositionNote>
      Colour, spacing, and the medallion tint all come from Rialto tokens, so the page inherits
      light and dark themes with no per-page overrides. The entrance animation is gated behind
      <code>prefers-reduced-motion</code>, collapsing to a static medallion when motion is reduced.
    </CompositionNote>
  </Stack>
);

/* ── Component ───────────────────────────────── */

export function BookingConfirmedExamplePage() {
  return (
    <ExamplePageLayout
      name="Booking Confirmed"
      description="Success result page with a reservation summary and next-step CTAs"
      sourceJsx={CONFIRMED_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.result}>
        <div className={styles.statusRegion} role="status">
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
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <Badge variant="success" dot>
            Confirmed
          </Badge>
        </div>
        <Text variant="display" as="h2">
          Your reservation is confirmed
        </Text>
        <Text variant="body" color="secondary" className={styles.copy}>
          We’ve emailed your confirmation and the details are below. Add it to your calendar so you
          don’t miss check-in.
        </Text>
        <Card className={styles.summary}>
          <Text variant="label" as="h3" className={styles.summaryTitle}>
            Reservation summary
          </Text>
          <DataList items={BOOKING_SUMMARY} orientation="horizontal" striped />
        </Card>
        <div className={styles.actions}>
          <Button variant="primary">View reservation</Button>
          <Button variant="secondary">Add to calendar</Button>
          <Button variant="ghost">Back to dashboard</Button>
        </div>
      </div>
    </ExamplePageLayout>
  );
}

BookingConfirmedExamplePage.displayName = "BookingConfirmedExamplePage";
