import { useState } from "react";
import { Card, Stack, Text, TimePicker } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function TimePickerPlayground() {
  const [time, setTime] = useState<string | null>("19:00");

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <TimePicker label="Reservation time" value={time} onChange={setTime} locale="en-US" />
      </Card>
      <Text variant="caption" color="secondary">
        Selected (HH:mm): <strong>{time ?? "none"}</strong>
      </Text>
    </Stack>
  );
}

function StepExample() {
  const [time, setTime] = useState<string | null>(null);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <TimePicker
          label="Every 30 minutes"
          placeholder="Pick a time"
          value={time}
          onChange={setTime}
          step={30}
          locale="en-US"
        />
      </Card>
      <Text variant="caption" color="secondary">
        The <code>step</code> prop sets the interval between slots. Defaults to 15 minutes — the
        reservation slot-interval domain default.
      </Text>
    </Stack>
  );
}

function BoundedExample() {
  const [time, setTime] = useState<string | null>(null);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: "var(--rialto-space-xl)", alignItems: "center" }}>
        <TimePicker
          label="Service hours (09:00–17:00)"
          placeholder="Pick a time"
          value={time}
          onChange={setTime}
          step={30}
          min="09:00"
          max="17:00"
          locale="en-US"
        />
      </Card>
      <Text variant="caption" color="secondary">
        Bounded to 09:00–17:00 (inclusive). For arbitrary per-slot rules pass{" "}
        <code>isTimeDisabled</code> instead — it is authoritative and replaces <code>min</code>/
        <code>max</code> when both are supplied.
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TimePickerPage() {
  return (
    <ComponentPageLayout
      name="Time Picker"
      description="Single-time selection via a popover-hosted listbox of interval slots. Controlled with 24h HH:mm strings — no Date objects cross the API. Locale-aware display, storage always HH:mm."
    >
      <Section title="Time Picker">
        <TimePickerPlayground />
      </Section>

      <Section title="Interval step">
        <StepExample />
      </Section>

      <Section title="Bounds & disabled times">
        <BoundedExample />
      </Section>

      <Section title="TimePicker props">
        <PropsTable component="TimePicker" />
      </Section>
    </ComponentPageLayout>
  );
}

TimePickerPage.displayName = "TimePickerPage";
