import { useEffect, useState } from "react";
import { Button, Card, DataList, Odometer, Stack, Stat, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

function LiveCounter() {
  const [value, setValue] = useState(128540);

  return (
    <Stack gap="md" align="start">
      <Odometer value={value} locale="en-US" size="lg" />
      <Stack direction="row" gap="xs" wrap>
        <Button variant="secondary" size="sm" onClick={() => setValue((v) => v + 1)}>
          +1
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setValue((v) => v + 137)}>
          +137
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setValue((v) => v + 10000)}>
          +10,000
        </Button>
        <Button variant="primary" size="sm" onClick={() => setValue(Math.floor(Math.random() * 1e6))}>
          Randomize
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setValue(0)}>
          Reset
        </Button>
      </Stack>
    </Stack>
  );
}

function AutoTicker() {
  const [value, setValue] = useState(4200);

  useEffect(() => {
    const t = setInterval(() => setValue((v) => v + Math.floor(Math.random() * 250)), 2000);
    return () => clearInterval(t);
  }, []);

  return <Odometer value={value} locale="en-US" size="md" />;
}

export function OdometerPage() {
  return (
    <ComponentPageLayout
      name="Odometer"
      description="A mechanical rolling-counter that animates a numeric value digit-by-digit by composing the SplitFlap primitive — extending its Solari physics to numbers. Reads a real number and formats it with locale grouping (Intl.NumberFormat). The animated reels are decorative; a single polite live region announces the whole value, never per-digit. Respects prefers-reduced-motion by snapping to the final value with no roll."
    >
      {/* ── Live counter ──────────────────────────────────────────── */}
      <Section title="Live Counter">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <LiveCounter />
        </Card>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack gap="lg" align="start">
          <Odometer value={90210} locale="en-US" size="sm" />
          <Odometer value={90210} locale="en-US" size="md" />
          <Odometer value={90210} locale="en-US" size="lg" />
        </Stack>
      </Section>

      {/* ── Formats ───────────────────────────────────────────────── */}
      <Section title="Formats">
        <Stack gap="md" align="start">
          <Stack gap="xs" align="start">
            <Text variant="caption" color="secondary">
              Integer with grouping
            </Text>
            <Odometer value={1234567} locale="en-US" />
          </Stack>
          <Stack gap="xs" align="start">
            <Text variant="caption" color="secondary">
              Currency (USD)
            </Text>
            <Odometer
              value={48250.75}
              locale="en-US"
              formatOptions={{ style: "currency", currency: "USD" }}
            />
          </Stack>
          <Stack gap="xs" align="start">
            <Text variant="caption" color="secondary">
              Percent
            </Text>
            <Odometer
              value={0.8642}
              locale="en-US"
              formatOptions={{ style: "percent", minimumFractionDigits: 1 }}
            />
          </Stack>
          <Stack gap="xs" align="start">
            <Text variant="caption" color="secondary">
              German locale grouping
            </Text>
            <Odometer value={1234567} locale="de-DE" />
          </Stack>
        </Stack>
      </Section>

      {/* ── Live ticker ───────────────────────────────────────────── */}
      <Section title="Live Updates">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <AutoTicker />
        </Card>
      </Section>

      {/* ── Inside a Stat ─────────────────────────────────────────── */}
      <Section title="Inside a Stat">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <Stat
            label="Total signups"
            value={<Odometer value={128540} locale="en-US" size="md" />}
            delta="+12.4%"
            trend="up"
          />
        </Card>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Odometer" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Announcement",
              value: "A single polite, atomic live region announces the whole formatted number",
            },
            {
              label: "Never per-digit",
              value: "The rolling reels are aria-hidden — assistive tech never hears each digit",
            },
            {
              label: "Reduced motion",
              value: "prefers-reduced-motion → snaps to the final value, no roll",
            },
            {
              label: "Composition",
              value: "Built from SplitFlap; separators (commas, decimals, currency) render as static glyphs",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

OdometerPage.displayName = "OdometerPage";
