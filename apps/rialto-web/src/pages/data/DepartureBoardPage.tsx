import { Card, DepartureBoard, Stack, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

const HERO_PHRASES = ["MAKE IT REAL", "SHIP THE FUTURE", "BUILD BOLDLY", "DESIGN WITH INTENT"];

const VALUE_PROPS = ["FAST BY DEFAULT", "TYPED END TO END", "ACCESSIBLE FIRST"];

export function DepartureBoardPage() {
  return (
    <ComponentPageLayout
      name="Departure Board"
      description="A split-flap departure board that flips through a sequence of headlines or value-props — the signature hero for marketing and rialto-web. It composes SplitFlap (no fork), exposes the current phrase to assistive technology, and renders static readable text when reduced motion is preferred."
    >
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <Section title="Marketing Hero">
        <Card variant="elevated">
          <Stack gap="md" align="center">
            <DepartureBoard phrases={HERO_PHRASES} />
            <Text variant="caption" color="secondary">
              Cycles every 3.2s by default. Each line flips into place cell by cell.
            </Text>
          </Stack>
        </Card>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack gap="lg" align="start">
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              sm
            </Text>
            <DepartureBoard phrases={VALUE_PROPS} size="sm" />
          </Stack>
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              md
            </Text>
            <DepartureBoard phrases={VALUE_PROPS} size="md" />
          </Stack>
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              lg (default)
            </Text>
            <DepartureBoard phrases={VALUE_PROPS} size="lg" />
          </Stack>
        </Stack>
      </Section>

      {/* ── Timing ────────────────────────────────────────────────── */}
      <Section title="Configurable Timing">
        <Stack gap="lg" align="start">
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              holdMs={1500} — brisk rotation
            </Text>
            <DepartureBoard phrases={VALUE_PROPS} size="md" holdMs={1500} />
          </Stack>
          <Stack gap="xs">
            <Text variant="caption" color="secondary">
              holdMs={5000} — slow, deliberate
            </Text>
            <DepartureBoard phrases={VALUE_PROPS} size="md" holdMs={5000} />
          </Stack>
        </Stack>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="DepartureBoard" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <Stack gap="sm">
          <Text variant="body" color="secondary">
            The decorative flap glyphs are marked <code>aria-hidden</code>. The current phrase is
            announced through a polite live region, so assistive technology hears each headline as
            it arrives without reading the animation frame by frame.
          </Text>
          <Text variant="body" color="secondary">
            When the visitor prefers reduced motion, the board renders the current phrase as plain,
            readable static text and stops auto-advancing — no flipping, no motion.
          </Text>
        </Stack>
      </Section>
    </ComponentPageLayout>
  );
}

DepartureBoardPage.displayName = "DepartureBoardPage";
