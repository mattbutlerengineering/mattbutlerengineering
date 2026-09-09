import { useEffect, useState } from "react";
import {
  Button,
  Card,
  DataList,
  NeonSign,
  Stack,
  Text,
  type NeonSignState,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

const STATES: readonly NeonSignState[] = ["open", "opening-soon", "closed", "unset"];

/** Caption per state — what a venue trading 5:00 PM–10:00 PM derives for its sign. */
const STATE_LABEL: Readonly<Record<NeonSignState, string>> = {
  open: "Open until 10:00 PM",
  "opening-soon": "Opens at 5:00 PM",
  closed: "Closed, opens Tuesday at 5:00 PM",
  unset: "No operating hours set",
};

/**
 * One service day, compressed: 2.4 s closed, 2.4 s opening-soon, 3.6 s open —
 * the open phase holds a beat longer so the strike-on is seen settling.
 */
const REPLAY_PHASES: readonly NeonSignState[] = [
  "closed",
  "closed",
  "opening-soon",
  "opening-soon",
  "open",
  "open",
  "open",
];
const REPLAY_TICK_MS = 1200;

/** The replay's closed phase is the same afternoon, so no weekday is named. */
const REPLAY_LABEL: Readonly<Record<NeonSignState, string>> = {
  ...STATE_LABEL,
  closed: "Closed, opens at 5:00 PM",
};

const SIZES = ["sm", "md", "lg"] as const;

/**
 * Replays a service day: the doors are shut, the tube warms as opening
 * approaches, then strikes on. One cycle every ~8.4 seconds.
 */
function ServiceDayReplay() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % REPLAY_PHASES.length), REPLAY_TICK_MS);
    return () => clearInterval(t);
  }, []);

  const state = REPLAY_PHASES[step]!;

  return (
    <Stack gap="md" align="center">
      <NeonSign state={state} aria-label={REPLAY_LABEL[state]} size="lg" />
    </Stack>
  );
}

/**
 * Hand-set the state. Pressing "open" also re-keys the sign so the strike
 * replays even when it is already lit — the instrument itself never restarts
 * an animation on a re-render.
 */
function StatePlayground() {
  const [state, setState] = useState<NeonSignState>("open");
  const [replayNonce, setReplayNonce] = useState(0);

  const pick = (next: NeonSignState) => {
    setState(next);
    if (next === "open") setReplayNonce((n) => n + 1);
  };

  return (
    <Stack gap="lg" align="start">
      <NeonSign key={replayNonce} state={state} aria-label={STATE_LABEL[state]} size="lg" />
      <Stack direction="row" gap="xs" wrap>
        {STATES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === state ? "primary" : "secondary"}
            onClick={() => pick(s)}
          >
            {s}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

export function NeonSignPage() {
  return (
    <ComponentPageLayout
      name="Neon Sign"
      description="An instrument for a venue's trading state — whether the doors are open right now. One neon tube spelling OPEN is mounted on a recessed housing with the fact stated in words beneath it: lit with the success token while open, warming gold while opening soon (the one place the accent appears), dark glass when closed, and no tube at all when hours were never set."
    >
      {/* ── Service day replay ────────────────────────────────────── */}
      <Section title="Service Day Replay">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <ServiceDayReplay />
        </Card>
      </Section>

      {/* ── States ────────────────────────────────────────────────── */}
      <Section title="States">
        <Stack gap="xl">
          {STATES.map((s) => (
            <Stack key={s} gap="xs">
              <Text variant="caption" color="secondary">
                {s}
              </Text>
              <NeonSign state={s} aria-label={STATE_LABEL[s]} />
            </Stack>
          ))}
        </Stack>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Playground">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <StatePlayground />
        </Card>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack gap="xl">
          {SIZES.map((size) => (
            <Stack key={size} gap="xs">
              <Text variant="caption" color="secondary">
                {size}
              </Text>
              <NeonSign state="open" aria-label={STATE_LABEL.open} size={size} />
            </Stack>
          ))}
        </Stack>
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="NeonSign" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: 'role="img"' },
            { label: "Name", value: "Required aria-label — state the fact, not the tube" },
            {
              label: "Tube hidden from AT",
              value: "Housing, tube and caption are aria-hidden; only the label is read",
            },
            {
              label: "Reduced motion",
              value: "No strike, no breathe; four static frames stay distinct",
            },
            {
              label: "Colour is not the only signal",
              value: "Pair with the caption; open and opening-soon are both lit",
            },
            {
              label: "Owns no clock",
              value: "State is a prop; the consumer derives it from hours + timezone",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

NeonSignPage.displayName = "NeonSignPage";
