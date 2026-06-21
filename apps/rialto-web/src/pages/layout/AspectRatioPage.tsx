import { AspectRatio, DataList, Stack, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const RATIOS: Array<{ ratio: number; label: string; width: number }> = [
  { ratio: 1, label: "1:1", width: 120 },
  { ratio: 4 / 3, label: "4:3", width: 160 },
  { ratio: 16 / 9, label: "16:9", width: 200 },
  { ratio: 21 / 9, label: "21:9", width: 240 },
];

function RatioBox({ label }: { label: string }) {
  return (
    <div
      style={{
        background: "var(--rialto-surface-matte)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--rialto-radius-soft)",
        fontFamily: "var(--rialto-font-mono)",
        fontSize: "var(--rialto-text-xs)",
        color: "var(--rialto-text-tertiary)",
      }}
    >
      {label}
    </div>
  );
}

export function AspectRatioPage() {
  return (
    <ComponentPageLayout
      name="Aspect Ratio"
      description="Pure CSS layout utility that maintains content proportions. Uses the native aspect-ratio property with an absolute-positioned inner container."
    >
      {/* ── Common Ratios ─────────────────────────────────────────── */}
      <Section title="Common Ratios">
        <Stack direction="row" gap="sm" align="end" wrap>
          {RATIOS.map(({ ratio, label, width }) => (
            <div key={label} style={{ width }}>
              <AspectRatio ratio={ratio}>
                <RatioBox label={label} />
              </AspectRatio>
            </div>
          ))}
        </Stack>
      </Section>

      {/* ── With Real Content ─────────────────────────────────────── */}
      <Section title="With Content">
        <div style={{ width: 320 }}>
          <AspectRatio ratio={16 / 9}>
            <div
              style={{
                background:
                  "linear-gradient(135deg, var(--rialto-surface-matte), var(--rialto-surface-recessed))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--rialto-radius-soft)",
                border: "1px solid var(--rialto-border)",
                flexDirection: "column",
                gap: "var(--rialto-space-xs)",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                stroke="var(--rialto-text-tertiary)"
                strokeWidth="1.5"
              >
                <rect x="4" y="6" width="24" height="18" rx="2" />
                <path d="M12 14l4-4 4 4" />
                <path d="M16 10v10" />
              </svg>
              <Text
                style={{
                  fontSize: "var(--rialto-text-xs)",
                  color: "var(--rialto-text-tertiary)",
                }}
              >
                Telemetry replay
              </Text>
            </div>
          </AspectRatio>
        </div>
      </Section>

      {/* ── Responsive ────────────────────────────────────────────── */}
      <Section title="Responsive (fills container)">
        <Stack gap="sm">
          <Text
            style={{
              margin: 0,
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
            }}
          >
            AspectRatio fills its parent container width. Resize the window to see it respond.
          </Text>
          <AspectRatio ratio={16 / 9}>
            <div
              style={{
                background: "var(--rialto-surface-recessed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--rialto-radius-soft)",
                fontFamily: "var(--rialto-font-mono)",
                fontSize: "var(--rialto-text-xs)",
                color: "var(--rialto-text-tertiary)",
              }}
            >
              16:9 (responsive)
            </div>
          </AspectRatio>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="AspectRatio" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Wrapper <div> with aspect-ratio CSS property" },
            {
              label: "Content",
              value: "Inner content is absolutely positioned — use appropriate ARIA on children",
            },
            { label: "Images", value: "Add alt text to any img children" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

AspectRatioPage.displayName = "AspectRatioPage";
