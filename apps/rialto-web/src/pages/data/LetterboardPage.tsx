import { Card, Letterboard, Stack, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

const MARQUEE = ["TONIGHT", [{ text: "OYSTER " }, { text: "HOUR", accent: true }], "5 TILL 7"];

const MENU = [
  "TODAYS PLATES",
  "",
  [{ text: "CHOWDER " }, { text: "9", accent: true }],
  [{ text: "PATTY MELT " }, { text: "14", accent: true }],
  [{ text: "KEY LIME PIE " }, { text: "7", accent: true }],
];

export function LetterboardPage() {
  return (
    <ComponentPageLayout
      name="Letterboard"
      description="A vintage diner letterboard: one moulded letter piece per character, slotted into the ridges of a recessed plate, each piece independently ink or accent. Purely presentational and motionless — a letterboard only changes when somebody's hands change it."
    >
      {/* ── Marquee ───────────────────────────────────────────────── */}
      <Section title="Marquee">
        <Card variant="elevated">
          <Stack gap="md" align="center">
            <Letterboard lines={MARQUEE} />
            <Text variant="caption" color="secondary">
              A row is either a plain string (all ink) or a list of {"{ text, accent }"} runs.
            </Text>
          </Stack>
        </Card>
      </Section>

      {/* ── Menu board ────────────────────────────────────────────── */}
      <Section title="Menu Board">
        <Stack gap="md" align="start">
          <Letterboard lines={MENU} size="sm" align="start" />
          <Text variant="caption" color="secondary">
            An empty string leaves a bare ridge — the spacer a real board gets by skipping a rail.
          </Text>
        </Stack>
      </Section>

      {/* ── Accent granularity ────────────────────────────────────── */}
      <Section title="Accent Letters">
        <Stack gap="lg" align="start">
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              A whole word
            </Text>
            <Letterboard lines={[[{ text: "OPEN " }, { text: "LATE", accent: true }]]} />
          </Stack>
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              A single letter
            </Text>
            <Letterboard
              lines={[[{ text: "SUNDA" }, { text: "Y", accent: true }, { text: " ROAST" }]]}
            />
          </Stack>
        </Stack>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack gap="lg" align="start">
          {(["sm", "md", "lg"] as const).map((size) => (
            <Stack key={size} gap="xs">
              <Text variant="caption" color="secondary">
                {size}
                {size === "md" ? " (default)" : ""}
              </Text>
              <Letterboard lines={["LAST CALL"]} size={size} />
            </Stack>
          ))}
        </Stack>
      </Section>

      {/* ── Alignment ─────────────────────────────────────────────── */}
      <Section title="Alignment">
        <Stack gap="lg" align="start">
          {(["start", "center", "end"] as const).map((align) => (
            <Stack key={align} gap="xs">
              <Text variant="caption" color="secondary">
                {align}
                {align === "center" ? " (default)" : ""}
              </Text>
              <Letterboard lines={["WALK INS", "WELCOME"]} size="sm" align={align} />
            </Stack>
          ))}
        </Stack>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Letterboard" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <Stack gap="sm">
          <Text variant="body" color="secondary">
            The plate and every letter piece are marked <code>aria-hidden</code>. The sign&apos;s
            words are rendered separately as ordinary visually-hidden paragraphs — one per row — so
            assistive technology hears &ldquo;OYSTER HOUR&rdquo; as text, never as a pile of single
            characters.
          </Text>
          <Text variant="body" color="secondary">
            The accessible reading keeps the casing you wrote; only the visible pieces are
            upper-cased, because a screen reader may spell an all-caps word out letter by letter.
          </Text>
          <Text variant="body" color="secondary">
            Accent runs are marked <code>&lt;strong&gt;</code> in that reading, so the red is never
            the only carrier of emphasis. Both letter colours sit on the same surface token, a pair
            measured at WCAG AA in both the light and dark themes.
          </Text>
          <Text variant="body" color="secondary">
            The component has no motion at all, so there is nothing for{" "}
            <code>prefers-reduced-motion</code> to switch off.
          </Text>
        </Stack>
      </Section>
    </ComponentPageLayout>
  );
}

LetterboardPage.displayName = "LetterboardPage";
