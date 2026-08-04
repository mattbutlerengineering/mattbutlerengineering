import { useState } from "react";
import { Calendar, Card, DatePicker, Stack, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function DatePickerPlayground() {
  const [date, setDate] = useState<string | null>("2026-07-15");

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <DatePicker label="Event date" value={date} onChange={setDate} locale="en-US" />
      </Card>
      <Text variant="caption" color="secondary">
        Selected: <strong>{date ?? "none"}</strong>
      </Text>
    </Stack>
  );
}

function InlineCalendarExample() {
  const [date, setDate] = useState<string | null>(null);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <Calendar value={date} onChange={setDate} locale="en-US" />
      </Card>
      <Text variant="caption" color="secondary">
        Selected: <strong>{date ?? "none"}</strong>
      </Text>
    </Stack>
  );
}

function BoundedExample() {
  const [date, setDate] = useState<string | null>(null);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <DatePicker
          label="Arrival (5–25 July 2026)"
          placeholder="Pick a day"
          value={date}
          onChange={setDate}
          min="2026-07-05"
          max="2026-07-25"
          locale="en-US"
        />
      </Card>
      <Text variant="caption" color="secondary">
        Bounded to 5–25 July 2026 (inclusive). For arbitrary per-date rules pass{" "}
        <code>isDateDisabled</code> instead — it is authoritative and replaces <code>min</code>/
        <code>max</code> when both are supplied.
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DatePickerPage() {
  return (
    <ComponentPageLayout
      name="Date Picker"
      description="Single-date selection via a popover-hosted calendar or an inline month grid. Controlled with yyyy-mm-dd ISO strings — no Date objects cross the API."
    >
      <Section title="Date Picker">
        <DatePickerPlayground />
      </Section>

      <Section title="Inline Calendar">
        <InlineCalendarExample />
      </Section>

      <Section title="Bounds & disabled dates">
        <BoundedExample />
      </Section>

      <Section title="DatePicker props">
        <PropsTable component="DatePicker" />
      </Section>

      <Section title="Calendar props">
        <PropsTable component="Calendar" />
      </Section>
    </ComponentPageLayout>
  );
}

DatePickerPage.displayName = "DatePickerPage";
