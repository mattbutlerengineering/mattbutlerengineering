import { useState } from "react";
import {
  Card,
  DataList,
  Ferrofluid,
  SegmentedControl,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

function FerrofluidPlayground() {
  const [speed, setSpeed] = useState<"slow" | "medium" | "fast">("slow");
  const [blobCount, setBlobCount] = useState(5);
  const [blurAmount, setBlurAmount] = useState(12);

  return (
    <Stack gap="lg">
      <Card variant="flat" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "280px",
            background: "var(--rialto-surface-recessed)",
          }}
        >
          <Ferrofluid speed={speed} blobCount={blobCount} blurAmount={blurAmount} />
        </div>
      </Card>
      <Stack gap="md">
        <Stack gap="xs">
          <Text variant="caption" color="secondary">
            Speed
          </Text>
          <SegmentedControl
            value={speed}
            onChange={(v) => setSpeed(v as "slow" | "medium" | "fast")}
            segments={[
              { id: "slow", label: "Slow" },
              { id: "medium", label: "Medium" },
              { id: "fast", label: "Fast" },
            ]}
          />
        </Stack>
        <Stack gap="xs">
          <Text variant="caption" color="secondary">
            Blob count: {blobCount}
          </Text>
          <input
            type="range"
            min={2}
            max={12}
            value={blobCount}
            onChange={(e) => setBlobCount(Number(e.target.value))}
          />
        </Stack>
        <Stack gap="xs">
          <Text variant="caption" color="secondary">
            Blur amount: {blurAmount}
          </Text>
          <input
            type="range"
            min={4}
            max={24}
            value={blurAmount}
            onChange={(e) => setBlurAmount(Number(e.target.value))}
          />
        </Stack>
      </Stack>
    </Stack>
  );
}

export function FerrofluidPage() {
  return (
    <ComponentPageLayout
      name="Ferrofluid"
      description="A decorative fluid animation that approximates ferrofluid using SVG metaballs. Several circles drift through the container; an SVG feGaussianBlur + feColorMatrix filter fuses overlapping circles into merged blobs with liquid surface tension. GPU-accelerated — no WebGL required."
    >
      {/* ── Hero example ──────────────────────────────────────────── */}
      <Section title="Default">
        <Card variant="flat" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "240px",
              background: "var(--rialto-surface-recessed)",
            }}
          >
            <Ferrofluid />
          </div>
        </Card>
      </Section>

      {/* ── Palette variations ────────────────────────────────────── */}
      <Section title="Colors">
        <Stack direction="row" gap="md" wrap>
          {[
            { color: "var(--rialto-accent)", label: "Accent (default)" },
            { color: "var(--rialto-warning)", label: "Warning" },
            { color: "var(--rialto-error)", label: "Error" },
            { color: "var(--rialto-success)", label: "Success" },
          ].map((v) => (
            <div
              key={v.label}
              style={{
                position: "relative",
                width: "180px",
                height: "180px",
                background: "var(--rialto-surface-recessed)",
                borderRadius: "var(--rialto-radius-default)",
                overflow: "hidden",
              }}
            >
              <Ferrofluid color={v.color} blobCount={4} />
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                  color: "var(--rialto-text-primary)",
                  fontSize: "var(--rialto-text-xs)",
                  background: "var(--rialto-surface-elevated)",
                  padding: "2px 6px",
                  borderRadius: "var(--rialto-radius-sharp)",
                }}
              >
                {v.label}
              </div>
            </div>
          ))}
        </Stack>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <FerrofluidPlayground />
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "color",
              type: "string",
              default: "var(--rialto-accent)",
              description: "CSS color for the blobs.",
            },
            {
              name: "blobCount",
              type: "number",
              default: "5",
              description: "How many fluid blobs to render.",
            },
            {
              name: "speed",
              type: '"slow" | "medium" | "fast"',
              default: '"slow"',
              description: "Drift speed preset.",
            },
            {
              name: "blurAmount",
              type: "number",
              default: "12",
              description: "Blur intensity — higher blurs merge blobs more readily.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Decorative by contract",
              value: "aria-hidden is always true — no role, no accessible name",
            },
            {
              label: "Non-interactive",
              value: "pointer-events: none — never steals clicks or focus",
            },
            {
              label: "Reduced motion",
              value: "prefers-reduced-motion → blobs freeze in a pleasing static composition",
            },
            {
              label: "If it carries meaning",
              value:
                "Wrap the component and add your own semantics in the parent — never repurpose the visual as an indicator",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

FerrofluidPage.displayName = "FerrofluidPage";
