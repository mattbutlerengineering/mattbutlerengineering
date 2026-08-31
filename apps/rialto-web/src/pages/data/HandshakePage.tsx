import { useEffect, useState } from "react";
import {
  Button,
  Card,
  DataList,
  Handshake,
  Stack,
  Text,
  type HandshakeState,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

const SIGN_IN_STATIONS = ["Browser", "Identity", "API"] as const;
const STATES: readonly HandshakeState[] = ["idle", "negotiating", "settled", "failed"];

/**
 * Replays an OIDC sign-in end to end: the browser hands off to the identity
 * provider, the code comes back and is exchanged for tokens bound for the API,
 * and the exchange settles. One cycle every ~6 seconds.
 */
function SignInReplay() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % 4), 1800);
    return () => clearInterval(t);
  }, []);

  const phase = (
    [
      { state: "negotiating", lane: 0, caption: "Redirecting to the identity provider" },
      { state: "negotiating", lane: 1, caption: "Exchanging the code for API tokens" },
      { state: "settled", lane: 1, caption: "Signed in — every party agrees" },
      { state: "idle", lane: 0, caption: "Session at rest" },
    ] as const
  )[step]!;

  return (
    <Stack gap="md" align="center">
      <Handshake
        aria-label="Sign-in replay"
        stations={SIGN_IN_STATIONS}
        state={phase.state}
        lane={phase.lane}
        size="lg"
        style={{ maxWidth: 420 }}
      />
      <Text variant="caption" color="tertiary">
        {phase.caption}
      </Text>
    </Stack>
  );
}

function StatePlayground() {
  const [state, setState] = useState<HandshakeState>("negotiating");
  const [lane, setLane] = useState(0);

  return (
    <Stack gap="lg" align="start">
      <Handshake
        aria-label={`Playground — ${state} on lane ${lane}`}
        stations={SIGN_IN_STATIONS}
        state={state}
        lane={lane}
        size="lg"
        style={{ maxWidth: 420 }}
      />
      <Stack direction="row" gap="md" wrap>
        <Stack direction="row" gap="xs" wrap>
          {STATES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === state ? "primary" : "secondary"}
              onClick={() => setState(s)}
            >
              {s}
            </Button>
          ))}
        </Stack>
        <Stack direction="row" gap="xs">
          {[0, 1].map((l) => (
            <Button
              key={l}
              size="sm"
              variant={l === lane ? "primary" : "secondary"}
              onClick={() => setLane(l)}
            >
              Lane {l}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}

export function HandshakePage() {
  return (
    <ComponentPageLayout
      name="Handshake"
      description="An instrument for a multi-party exchange — an OIDC sign-in, a webhook confirmation, a device pairing. Each station is a recessed LED, the legs between them are machined grooves, and while the parties negotiate a single gold credential pulse shuttles along the active leg. Gold is reserved for 'in flight'; settled and failed re-light the LEDs with the semantic success and error tokens."
    >
      {/* ── Sign-in replay ────────────────────────────────────────── */}
      <Section title="Sign-in Replay">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <SignInReplay />
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
              <Handshake
                aria-label={`State: ${s}`}
                stations={["Browser", "Identity"]}
                state={s}
                style={{ maxWidth: 320 }}
              />
            </Stack>
          ))}
        </Stack>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Lanes">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-xl)" }}>
          <StatePlayground />
        </Card>
      </Section>

      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <Stack gap="xl">
          <Handshake
            aria-label="Small"
            stations={["Phone", "Watch"]}
            size="sm"
            style={{ maxWidth: 240 }}
          />
          <Handshake
            aria-label="Medium"
            stations={["Phone", "Watch"]}
            size="md"
            style={{ maxWidth: 280 }}
          />
          <Handshake
            aria-label="Large"
            stations={["Phone", "Watch"]}
            size="lg"
            style={{ maxWidth: 320 }}
          />
        </Stack>
      </Section>

      {/* ── Without labels ────────────────────────────────────────── */}
      <Section title="Without Labels">
        <Handshake
          aria-label="Pairing"
          stations={["Phone", "Watch"]}
          showLabels={false}
          style={{ maxWidth: 200 }}
        />
      </Section>

      {/* ── Props ─────────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="Handshake" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: 'role="img"' },
            { label: "Name", value: "Required aria-label — describe the exchange, not the LEDs" },
            {
              label: "Track hidden from AT",
              value: "Stations, grooves, and the pulse are aria-hidden; only the label is read",
            },
            {
              label: "Reduced motion",
              value: "prefers-reduced-motion → the pulse parks mid-groove and LEDs stop breathing",
            },
            {
              label: "Colour is not the only signal",
              value: "Pair with a status line — the LEDs alone do not announce state changes",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

HandshakePage.displayName = "HandshakePage";
