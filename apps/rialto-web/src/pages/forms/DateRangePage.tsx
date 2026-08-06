import { useState } from "react";
import { Card, DateRange, Stack, Text } from "@mattbutlerengineering/rialto";
import type { DateRangeValue } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY: DateRangeValue = { start: null, end: null };

function formatRange(range: DateRangeValue): string {
  if (!range.start) return "none";
  if (!range.end) return `${range.start} → …`;
  return `${range.start} → ${range.end}`;
}

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function DateRangePlayground() {
  const [range, setRange] = useState<DateRangeValue>({
    start: "2026-07-15",
    end: "2026-07-19",
  });

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <DateRange value={range} onChange={setRange} locale="en-US" />
      </Card>
      <Text variant="caption" color="secondary">
        Selected: <strong>{formatRange(range)}</strong>
      </Text>
    </Stack>
  );
}

function BoundedExample() {
  const [range, setRange] = useState<DateRangeValue>(EMPTY);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <DateRange
          value={range}
          onChange={setRange}
          min="2026-07-05"
          max="2026-07-25"
          locale="en-US"
        />
      </Card>
      <Text variant="caption" color="secondary">
        Bounded to 5&ndash;25 July 2026 (inclusive). For arbitrary per-date rules pass{" "}
        <code>isDateDisabled</code> instead &mdash; it is authoritative and replaces{" "}
        <code>min</code>/<code>max</code> when both are supplied.
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DateRangePage() {
  return (
    <ComponentPageLayout
      name="Date Range"
      description="Inline date-range selection on a locale-aware month grid. The first activation sets the start, the second sets the end (endpoints auto-order, same-day allowed); an in-progress preview follows the hovered or focused day. Controlled with { start, end } yyyy-mm-dd ISO strings."
    >
      <Section title="Date Range">
        <DateRangePlayground />
      </Section>

      <Section title="Bounds & disabled dates">
        <BoundedExample />
      </Section>

      <Section title="DateRange props">
        <PropsTable component="DateRange" />
      </Section>
    </ComponentPageLayout>
  );
}

DateRangePage.displayName = "DateRangePage";
