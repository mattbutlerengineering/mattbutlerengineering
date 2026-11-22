import { Card, Steam, DataList, Stack, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

const THEME_SAMPLES = [
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
] as const;

function SteamStage({ height, theme }: { height: string; theme?: "light" | "dark" }) {
  return (
    <Card variant="flat" style={{ padding: 0, overflow: "hidden" }}>
      <div
        data-theme={theme}
        style={{
          position: "relative",
          width: "100%",
          height,
          background: "var(--rialto-surface)",
        }}
      >
        <Steam />
      </div>
    </Card>
  );
}

export function SteamPage() {
  return (
    <ComponentPageLayout
      name="Steam"
      description="An ambient canvas backdrop in the spirit of steam off the kitchen pass or the coffee bar: a few large, soft wisps rise, swell and fold into one another, fading in low and out as they climb. The occasional thick wisp is tinted with the gold accent; the rest sit at very low opacity in the primary text color. Canvas 2D only — no WebGL, no dependencies."
    >
      {/* ── Hero example ──────────────────────────────────────────── */}
      <Section title="Default">
        <SteamStage height="360px" />
      </Section>

      {/* ── Theme reactivity ──────────────────────────────────────── */}
      <Section title="Themes">
        <Stack gap="md">
          <Text variant="caption" color="secondary">
            Colors are read from live theme tokens and re-read whenever the theme changes — the same
            component, scoped to each theme.
          </Text>
          <Stack direction="row" gap="md" wrap>
            {THEME_SAMPLES.map((sample) => (
              <div key={sample.theme} style={{ flex: "1 1 320px" }}>
                <Stack gap="xs">
                  <Text variant="caption" color="secondary">
                    {sample.label}
                  </Text>
                  <SteamStage height="220px" theme={sample.theme} />
                </Stack>
              </div>
            ))}
          </Stack>
        </Stack>
      </Section>

      {/* ── Usage ─────────────────────────────────────────────────── */}
      <Section title="Usage">
        <Stack gap="md">
          <Text variant="body">
            Steam fills its container, so give that container{" "}
            <Text as="span" variant="detail">
              position: relative
            </Text>{" "}
            and a height, then layer your content above it. It is an expressive element: use one per
            view, as the backdrop of a single hero or empty-state slot, and never stack it with
            SilkFlow or another backdrop.
          </Text>
          <div style={{ position: "relative", height: "300px", overflow: "hidden" }}>
            <Steam />
            <Stack
              gap="sm"
              style={{
                position: "relative",
                height: "100%",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
              }}
            >
              <Text variant="display">Fresh off the pass</Text>
              <Text variant="body" color="secondary">
                Content layers over the canvas — it never intercepts pointer events.
              </Text>
            </Stack>
          </div>
        </Stack>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Steam" />
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
              value: "pointer-events: none — never steals clicks or focus from content",
            },
            {
              label: "Reduced motion",
              value:
                "prefers-reduced-motion → a static surface gradient poster; the canvas and its animation loop are never created",
            },
            {
              label: "Off-screen and background tabs",
              value:
                "The frame loop pauses via IntersectionObserver and visibilitychange, so it costs nothing when unseen",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SteamPage.displayName = "SteamPage";
