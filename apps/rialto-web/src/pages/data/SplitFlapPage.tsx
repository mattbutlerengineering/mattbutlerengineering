import { useEffect, useState } from "react";
import { Button, Card, DataList, SplitFlap, Stack, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

const ARRIVAL_STATUSES = ["ARRIVED", "ON TIME", "DELAYED", "BOARDING", "CANCELLED"];

function ArrivalsBoard() {
  const [status, setStatus] = useState(ARRIVAL_STATUSES[0]!);

  return (
    <Stack gap="md" align="start">
      <SplitFlap
        value={status}
        length={9}
        size="lg"
        aria-label={`Flight status: ${status.toLowerCase()}`}
      />
      <Stack direction="row" gap="xs" wrap>
        {ARRIVAL_STATUSES.map((s) => (
          <Button
            key={s}
            variant={s === status ? "primary" : "secondary"}
            size="sm"
            onClick={() => setStatus(s)}
          >
            {s}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

function AutoCycler() {
  const words = ["HELLO", "WORLD", "RIALTO", "READY", "GO"];
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % words.length), 2500);
    return () => clearInterval(t);
  }, [words.length]);

  return (
    <SplitFlap
      value={words[i]!}
      length={6}
      size="md"
      aria-label={`Currently showing: ${words[i]}`}
    />
  );
}

export function SplitFlapPage() {
  return (
    <ComponentPageLayout
      name="Split Flap"
      description="A Solari-style character display. Each cell mechanically cycles through its charset to arrive at its target, producing the characteristic cascade of falling flaps. The component renders as a single role='img' — the animated cells are decorative and screen readers only hear the aria-label."
    >
      {/* ── Arrivals demo ─────────────────────────────────────────── */}
      <Section title="Arrivals Board">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <ArrivalsBoard />
        </Card>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack gap="lg">
          <SplitFlap value="SMALL" size="sm" aria-label="Small size demo" />
          <SplitFlap value="MEDIUM" size="md" aria-label="Medium size demo" />
          <SplitFlap value="LARGE" size="lg" aria-label="Large size demo" />
        </Stack>
      </Section>

      {/* ── Charsets ──────────────────────────────────────────────── */}
      <Section title="Charsets">
        <Stack gap="md">
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              alpha
            </Text>
            <SplitFlap value="ABC" charset="alpha" aria-label="Alpha charset" />
          </Stack>
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              numeric
            </Text>
            <SplitFlap value="42" charset="numeric" aria-label="Numeric charset" />
          </Stack>
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              alphanumeric (default)
            </Text>
            <SplitFlap value="GATE 12" charset="alphanumeric" aria-label="Alphanumeric charset" />
          </Stack>
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              full (with punctuation)
            </Text>
            <SplitFlap value="HELLO!" charset="full" aria-label="Full charset" />
          </Stack>
        </Stack>
      </Section>

      {/* ── Auto cycle ────────────────────────────────────────────── */}
      <Section title="Live Updates">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <AutoCycler />
        </Card>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="SplitFlap" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: 'role="img"' },
            { label: "Name", value: "Required aria-label — never inferred from value" },
            {
              label: "Cells hidden from AT",
              value: "Every cell is aria-hidden; the animation is treated as decorative",
            },
            {
              label: "Intermediate chars silenced",
              value: "The cycling A→B→C→... transitions are never announced",
            },
            {
              label: "Reduced motion",
              value: "prefers-reduced-motion → cells jump instantly to target, no cycle",
            },
            {
              label: "Contrast",
              value: "Amber-on-black meets WCAG AAA for non-text graphic content",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SplitFlapPage.displayName = "SplitFlapPage";
